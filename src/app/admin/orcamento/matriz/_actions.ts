"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

interface ActionResult {
  success?: true;
  error?: string;
}

export async function saveMatrixEntries(input: {
  year: number;
  month: number;
  entityNodeId: string;
  entries: { accountNodeId: string; costCenterNodeId: string; amount: number }[];
}): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (input.entries.length === 0) return { success: true };

    const supabase = await createClient();
    const rows = input.entries.map((e) => ({
      tenant_id: tenant.tenantId,
      year: input.year,
      month: input.month,
      entity_node_id: input.entityNodeId,
      cost_center_node_id: e.costCenterNodeId,
      account_node_id: e.accountNodeId,
      amount: e.amount,
      created_by: tenant.userId,
    }));

    const { error } = await supabase
      .from("matrix_budget_entries")
      .upsert(rows, {
        onConflict: "tenant_id,year,month,cost_center_node_id,account_node_id,entity_node_id",
      });
    if (error) return { error: error.message };

    revalidatePath("/admin/orcamento/matriz");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function importMatrixEntries(input: {
  rows: { values: Record<string, string> }[];
}): Promise<{ successCount: number; errorCount: number; errors: { rowIndex: number; message: string }[] }> {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  const supabase = await createClient();

  const errors: { rowIndex: number; message: string }[] = [];
  let successCount = 0;

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
    const v = input.rows[rowIndex].values;
    const year = Number(v.ano);
    const month = Number(v.mes);
    const amount = Number(v.valor);

    if (!v.entidade || !v.centro_custo || !v.conta || !Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(amount)) {
      errors.push({ rowIndex, message: "Linha incompleta ou com valores inválidos." });
      continue;
    }

    const { error } = await supabase.from("matrix_budget_entries").upsert(
      {
        tenant_id: tenant.tenantId,
        year,
        month,
        entity_node_id: v.entidade,
        cost_center_node_id: v.centro_custo,
        account_node_id: v.conta,
        amount,
        created_by: tenant.userId,
      },
      { onConflict: "tenant_id,year,month,cost_center_node_id,account_node_id,entity_node_id" }
    );
    if (error) {
      errors.push({ rowIndex, message: error.message });
      continue;
    }
    successCount++;
  }

  if (successCount > 0) revalidatePath("/admin/orcamento/matriz");
  return { successCount, errorCount: errors.length, errors };
}
