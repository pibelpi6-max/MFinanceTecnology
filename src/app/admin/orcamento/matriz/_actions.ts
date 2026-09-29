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
