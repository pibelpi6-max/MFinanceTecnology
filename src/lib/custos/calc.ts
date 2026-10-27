export type InputKind = "materia_prima" | "embalagem" | "mao_de_obra";

export interface RecipeLine {
  quantity: number;
  lossPct: number;
  unitCost: number;
}

/** Custo de uma linha da ficha: quantidade com perda × custo unitário do insumo. */
export function lineCost(l: RecipeLine): number {
  return l.quantity * (1 + l.lossPct / 100) * l.unitCost;
}

/** Custo do lote e custo unitário do produto (lote ÷ rendimento). */
export function recipeTotals(lines: RecipeLine[], yieldQty: number): { batch: number; unit: number } {
  const batch = lines.reduce((s, l) => s + lineCost(l), 0);
  return { batch, unit: yieldQty > 0 ? batch / yieldQty : 0 };
}
