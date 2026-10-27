import { describe, expect, it } from "vitest";
import { lineCost, recipeTotals } from "./calc";

describe("custos/calc", () => {
  it("aplica perda sobre a quantidade", () => {
    expect(lineCost({ quantity: 10, lossPct: 10, unitCost: 2 })).toBeCloseTo(22);
  });
  it("soma o lote e divide pelo rendimento", () => {
    const t = recipeTotals([{ quantity: 2, lossPct: 0, unitCost: 5 }, { quantity: 1, lossPct: 0, unitCost: 10 }], 4);
    expect(t.batch).toBe(20);
    expect(t.unit).toBe(5);
  });
  it("rendimento zero não quebra", () => {
    expect(recipeTotals([], 0).unit).toBe(0);
  });
});
