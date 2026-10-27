import { createClient } from "@/lib/supabase/server";
import type { InputKind } from "./calc";

export interface CostInput {
  id: string;
  code: string;
  name: string;
  kind: InputKind;
  unit: string;
  unitCost: number;
}

export interface CostRecipe {
  yieldQty: number;
  items: { inputId: string; quantity: number; lossPct: number }[];
}

export interface CustosData {
  inputs: CostInput[];
  recipes: Record<string, CostRecipe>;
  /** false quando a migration 0022 ainda não foi rodada. */
  ready: boolean;
}

export async function getCustosData(tenantId: string, orcamentoId: string): Promise<CustosData> {
  const supabase = await createClient();
  const inputsRes = await supabase
    .from("cost_inputs")
    .select("id, code, name, kind, unit, unit_cost")
    .eq("tenant_id", tenantId)
    .order("name");
  if (inputsRes.error) return { inputs: [], recipes: {}, ready: false };

  const recipesRes = await supabase
    .from("cost_recipes")
    .select("id, product_node_id, yield_qty")
    .eq("tenant_id", tenantId)
    .eq("orcamento_id", orcamentoId);
  const recipeRows = recipesRes.data ?? [];
  const ids = recipeRows.map((r) => r.id as string);
  const itemsRes = ids.length
    ? await supabase
        .from("cost_recipe_items")
        .select("recipe_id, input_id, quantity, loss_pct, sort_order")
        .eq("tenant_id", tenantId)
        .in("recipe_id", ids)
        .order("sort_order")
    : { data: [] as { recipe_id: string; input_id: string; quantity: number; loss_pct: number }[] };

  const recipes: Record<string, CostRecipe> = {};
  for (const r of recipeRows) {
    recipes[r.product_node_id as string] = {
      yieldQty: Number(r.yield_qty),
      items: (itemsRes.data ?? [])
        .filter((i) => i.recipe_id === r.id)
        .map((i) => ({ inputId: i.input_id as string, quantity: Number(i.quantity), lossPct: Number(i.loss_pct) })),
    };
  }
  return {
    inputs: (inputsRes.data ?? []).map((i) => ({
      id: i.id as string,
      code: i.code as string,
      name: i.name as string,
      kind: i.kind as InputKind,
      unit: i.unit as string,
      unitCost: Number(i.unit_cost),
    })),
    recipes,
    ready: true,
  };
}
