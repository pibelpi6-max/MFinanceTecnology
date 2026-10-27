"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { getItemKinds } from "@/lib/receita/queries";

interface Result {
  success?: true;
  error?: string;
}

const KINDS = ["materia_prima", "embalagem", "mao_de_obra"];
const MIGRATION_HINT = "Rode a migration 0022 (Custos) no Supabase antes de usar este módulo.";

function refresh(orcamentoId: string) {
  revalidatePath(`/admin/orcamentos/${orcamentoId}/custos`);
}

function friendly(message: string): string {
  return /cost_(inputs|recipes|recipe_items)/.test(message) && /does not exist|schema cache|permission/i.test(message)
    ? MIGRATION_HINT
    : message;
}

export async function saveCostInput(input: {
  orcamentoId: string;
  id?: string;
  code: string;
  name: string;
  kind: string;
  unit: string;
  unitCost: number;
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const code = input.code.trim();
    const name = input.name.trim();
    const unit = input.unit.trim() || "un";
    if (!code || !name) return { error: "Informe código e nome do insumo" };
    if (!KINDS.includes(input.kind)) return { error: "Tipo de insumo inválido" };
    if (!Number.isFinite(input.unitCost) || input.unitCost < 0) return { error: "Custo unitário inválido" };
    const supabase = await createClient();
    const row = { tenant_id: tenant.tenantId, code, name, kind: input.kind, unit, unit_cost: input.unitCost };
    const { error } = input.id
      ? await supabase.from("cost_inputs").update(row).eq("id", input.id).eq("tenant_id", tenant.tenantId)
      : await supabase.from("cost_inputs").insert(row);
    if (error) return { error: error.code === "23505" ? `Já existe um insumo com o código ${code}` : friendly(error.message) };
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar o insumo" };
  }
}

export async function deleteCostInput(input: { orcamentoId: string; id: string }): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    const supabase = await createClient();
    const { error } = await supabase.from("cost_inputs").delete().eq("id", input.id).eq("tenant_id", tenant.tenantId);
    if (error) return { error: error.code === "23503" ? "Este insumo está em uma ficha técnica; retire-o da ficha antes de excluir." : friendly(error.message) };
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao excluir o insumo" };
  }
}

export async function saveRecipe(input: {
  orcamentoId: string;
  productId: string;
  yieldQty: number;
  items: { inputId: string; quantity: number; lossPct: number }[];
}): Promise<Result> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { error: "Não autenticado" };
    if (!Number.isFinite(input.yieldQty) || input.yieldQty <= 0) return { error: "O rendimento deve ser maior que zero" };
    for (const i of input.items) {
      if (!i.inputId) return { error: "Escolha o insumo em todas as linhas" };
      if (!Number.isFinite(i.quantity) || i.quantity < 0) return { error: "Quantidade inválida" };
      if (!Number.isFinite(i.lossPct) || i.lossPct < 0 || i.lossPct > 100) return { error: "A perda deve ficar entre 0 e 100%" };
    }
    const supabase = await createClient();
    const { data: orc } = await supabase.from("orcamentos").select("id").eq("id", input.orcamentoId).eq("tenant_id", tenant.tenantId).maybeSingle();
    if (!orc) return { error: "Orçamento não encontrado" };
    const kinds = await getItemKinds(tenant.tenantId);
    if (kinds[input.productId] === "servico") return { error: "Serviço não tem ficha técnica" };

    const { data: recipe, error: rErr } = await supabase
      .from("cost_recipes")
      .upsert(
        { tenant_id: tenant.tenantId, orcamento_id: input.orcamentoId, product_node_id: input.productId, yield_qty: input.yieldQty, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id,orcamento_id,product_node_id" },
      )
      .select("id")
      .single();
    if (rErr || !recipe) return { error: friendly(rErr?.message ?? "Erro ao salvar a ficha") };

    const del = await supabase.from("cost_recipe_items").delete().eq("tenant_id", tenant.tenantId).eq("recipe_id", recipe.id);
    if (del.error) return { error: friendly(del.error.message) };
    if (input.items.length > 0) {
      const ins = await supabase.from("cost_recipe_items").insert(
        input.items.map((i, n) => ({
          tenant_id: tenant.tenantId, recipe_id: recipe.id, input_id: i.inputId, quantity: i.quantity, loss_pct: i.lossPct, sort_order: n,
        })),
      );
      if (ins.error) return { error: friendly(ins.error.message) };
    }
    refresh(input.orcamentoId);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar a ficha técnica" };
  }
}
