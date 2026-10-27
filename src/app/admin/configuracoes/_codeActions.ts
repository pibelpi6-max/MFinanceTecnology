"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { parseErpCodes } from "@/lib/dimensions/erpCodes";

interface ActionResult {
  success?: true;
  error?: string;
}

/**
 * Substitui o conjunto de códigos do ERP de um item do ÚLTIMO nível da
 * hierarquia. Vários códigos por item; o mesmo código não pode apontar para
 * dois itens da mesma hierarquia.
 */
export async function saveNodeErpCodes(input: {
  nodeId: string;
  codes: string;
  year: number;
}): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (tenant.role !== "admin") return { error: "Apenas administradores podem alterar códigos do ERP." };
    const supabase = await createClient();

    const { data: node } = await supabase
      .from("dimension_nodes")
      .select("id, dimension_type_id, code")
      .eq("id", input.nodeId)
      .eq("tenant_id", tenant.tenantId)
      .maybeSingle();
    if (!node) return { error: "Item não encontrado." };

    // Só o último nível aceita códigos: nenhum filho vigente.
    const { count: childCount } = await supabase
      .from("dimension_node_versions")
      .select("id", { count: "exact", head: true })
      .eq("parent_node_id", input.nodeId)
      .lte("valid_from_year", input.year)
      .or(`valid_until_year.is.null,valid_until_year.gte.${input.year}`);
    if ((childCount ?? 0) > 0) {
      return { error: "Códigos do ERP só podem ser relacionados a itens do último nível." };
    }

    const wanted = parseErpCodes(input.codes);

    const { data: existing } = await supabase
      .from("dimension_node_codes")
      .select("id, dimension_node_id, erp_code")
      .eq("tenant_id", tenant.tenantId)
      .eq("dimension_type_id", node.dimension_type_id);
    const rows = existing ?? [];

    // Conflito: código já usado por OUTRO item da mesma hierarquia.
    const taken = new Map(rows.filter((r) => r.dimension_node_id !== node.id).map((r) => [r.erp_code.toLowerCase(), r]));
    const conflicts = wanted.filter((c) => taken.has(c.toLowerCase()));
    if (conflicts.length > 0) {
      return { error: `Código já relacionado a outro item desta hierarquia: ${conflicts.join(", ")}.` };
    }

    const mine = rows.filter((r) => r.dimension_node_id === node.id);
    const wantedKeys = new Set(wanted.map((c) => c.toLowerCase()));
    const toDelete = mine.filter((r) => !wantedKeys.has(r.erp_code.toLowerCase())).map((r) => r.id);
    const mineKeys = new Set(mine.map((r) => r.erp_code.toLowerCase()));
    const toInsert = wanted
      .filter((c) => !mineKeys.has(c.toLowerCase()))
      .map((c) => ({
        tenant_id: tenant.tenantId,
        dimension_type_id: node.dimension_type_id,
        dimension_node_id: node.id,
        erp_code: c,
      }));

    if (toDelete.length > 0) {
      const { error } = await supabase.from("dimension_node_codes").delete().in("id", toDelete);
      if (error) return { error: error.message };
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from("dimension_node_codes").insert(toInsert);
      if (error) return { error: error.message };
    }

    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
