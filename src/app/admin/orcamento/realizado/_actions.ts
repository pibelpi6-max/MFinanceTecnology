"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

interface ActionResult {
  success?: true;
  error?: string;
}

export async function createExpenseEntry(input: {
  year: number;
  month: number;
  entityNodeId: string;
  accountNodeId: string;
  costCenterNodeId: string;
  amount: number;
  description: string;
}): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (tenant.role === "leitor") return { error: "Seu perfil não tem permissão para lançar despesas." };
    if (!(input.amount > 0)) return { error: "Informe um valor maior que zero." };

    const supabase = await createClient();
    const { error } = await supabase.from("expense_entries").insert({
      tenant_id: tenant.tenantId,
      year: input.year,
      month: input.month,
      entity_node_id: input.entityNodeId,
      account_node_id: input.accountNodeId,
      cost_center_node_id: input.costCenterNodeId,
      amount: input.amount,
      description: input.description || null,
      source: "manual",
      created_by: tenant.userId,
    });
    if (error) return { error: error.message };

    revalidatePath("/admin/orcamento/realizado");
    revalidatePath("/admin/orcamento/comparativo");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function updateExpenseEntry(input: {
  id: string;
  accountNodeId: string;
  costCenterNodeId: string;
  amount: number;
  description: string;
}): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (tenant.role === "leitor") return { error: "Seu perfil não tem permissão para editar despesas." };
    if (!(input.amount > 0)) return { error: "Informe um valor maior que zero." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("expense_entries")
      .update({
        account_node_id: input.accountNodeId,
        cost_center_node_id: input.costCenterNodeId,
        amount: input.amount,
        description: input.description || null,
      })
      .eq("id", input.id);
    if (error) return { error: error.message };

    revalidatePath("/admin/orcamento/realizado");
    revalidatePath("/admin/orcamento/comparativo");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}

export async function deleteExpenseEntry(input: { id: string }): Promise<ActionResult> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (tenant.role === "leitor") return { error: "Seu perfil não tem permissão para excluir despesas." };

    const supabase = await createClient();
    const { error } = await supabase.from("expense_entries").delete().eq("id", input.id);
    if (error) return { error: error.message };

    revalidatePath("/admin/orcamento/realizado");
    revalidatePath("/admin/orcamento/comparativo");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro inesperado" };
  }
}
