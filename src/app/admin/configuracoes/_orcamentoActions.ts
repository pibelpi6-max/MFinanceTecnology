"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import type { OrcamentoStatus } from "@/lib/orcamentos/types";

interface ActionResult {
  success?: true;
  id?: string;
  error?: string;
}

async function requireAdmin() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (tenant.role !== "admin") {
    throw new Error("Apenas administradores podem alterar parâmetros do sistema.");
  }
  return tenant;
}

function afterMutation() {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin", "layout");
}

export async function createOrcamento(input: {
  year: number;
  label: string;
  status: OrcamentoStatus;
  conjuntoEstruturaId: string | null;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const label = input.label.trim();
    if (!label) return { error: "Informe um rótulo para a revisão." };

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("orcamentos")
      .insert({
        tenant_id: tenant.tenantId,
        year: input.year,
        label,
        status: input.status,
        conjunto_estrutura_id: input.conjuntoEstruturaId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { error: "Já existe um Orçamento com esse ano e rótulo." };
      return { error: error.message };
    }

    afterMutation();
    return { success: true, id: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateOrcamento(input: {
  id: string;
  year: number;
  label: string;
  status: OrcamentoStatus;
  conjuntoEstruturaId: string | null;
}): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const label = input.label.trim();
    if (!label) return { error: "Informe um rótulo para a revisão." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        year: input.year,
        label,
        status: input.status,
        conjunto_estrutura_id: input.conjuntoEstruturaId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) {
      if (error.code === "23505") return { error: "Já existe um Orçamento com esse ano e rótulo." };
      return { error: error.message };
    }

    afterMutation();
    return { success: true, id: input.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function deleteOrcamento(input: { id: string }): Promise<ActionResult> {
  try {
    const tenant = await requireAdmin();
    const supabase = await createClient();

    const [{ count: matrixCount, error: matrixError }, { count: packageCount, error: packageError }] =
      await Promise.all([
        supabase.from("matrix_budget_entries").select("id", { count: "exact", head: true }).eq("orcamento_id", input.id),
        supabase.from("budget_packages").select("id", { count: "exact", head: true }).eq("orcamento_id", input.id),
      ]);
    if (matrixError) return { error: matrixError.message };
    if (packageError) return { error: packageError.message };
    if ((matrixCount ?? 0) > 0 || (packageCount ?? 0) > 0) {
      return { error: "Este Orçamento já tem lançamentos ou pacotes associados. Não é possível excluí-lo." };
    }

    const { error } = await supabase
      .from("orcamentos")
      .delete()
      .eq("id", input.id)
      .eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.message };

    afterMutation();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
