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

export async function importExpenseEntries(input: {
  rows: { values: Record<string, string> }[];
}): Promise<{ successCount: number; errorCount: number; errors: { rowIndex: number; message: string }[] }> {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("Não autenticado");
  if (tenant.role === "leitor") throw new Error("Seu perfil não tem permissão para lançar despesas.");
  const supabase = await createClient();

  const errors: { rowIndex: number; message: string }[] = [];
  let successCount = 0;

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
    const v = input.rows[rowIndex].values;
    const year = Number(v.ano);
    const month = Number(v.mes);
    const amount = Number(v.valor);

    if (!v.entidade || !v.centro_custo || !v.conta || !Number.isFinite(year) || !Number.isFinite(month) || !(amount > 0)) {
      errors.push({ rowIndex, message: "Linha incompleta, com valores inválidos ou valor zerado." });
      continue;
    }

    const { error } = await supabase.from("expense_entries").insert({
      tenant_id: tenant.tenantId,
      year,
      month,
      entity_node_id: v.entidade,
      account_node_id: v.conta,
      cost_center_node_id: v.centro_custo,
      amount,
      description: v.descricao || null,
      source: "import",
      created_by: tenant.userId,
    });
    if (error) {
      errors.push({ rowIndex, message: error.message });
      continue;
    }
    successCount++;
  }

  if (successCount > 0) {
    revalidatePath("/admin/orcamento/realizado");
    revalidatePath("/admin/orcamento/comparativo");
  }
  return { successCount, errorCount: errors.length, errors };
}
