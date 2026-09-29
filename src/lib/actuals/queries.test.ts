import { describe, it, expect } from "vitest";
import { sumActualsByCell, resolveTolerancePct } from "./queries";
import type { ExpenseEntryRow, ToleranceRow } from "./types";

function makeEntry(overrides: Partial<ExpenseEntryRow>): ExpenseEntryRow {
  return {
    id: "e1",
    year: 2026,
    month: 3,
    accountNodeId: "acc-1",
    costCenterNodeId: "cc-1",
    entityNodeId: "ent-1",
    amount: 100,
    description: null,
    source: "manual",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTolerance(overrides: Partial<ToleranceRow>): ToleranceRow {
  return {
    id: "t1",
    year: 2026,
    costCenterNodeId: null,
    accountNodeId: null,
    thresholdType: "percentual",
    thresholdValue: 10,
    ...overrides,
  };
}

describe("sumActualsByCell", () => {
  it("soma múltiplos lançamentos na mesma célula (conta x centro de custo)", () => {
    const entries = [
      makeEntry({ accountNodeId: "acc-1", costCenterNodeId: "cc-1", amount: 100 }),
      makeEntry({ accountNodeId: "acc-1", costCenterNodeId: "cc-1", amount: 50 }),
      makeEntry({ accountNodeId: "acc-1", costCenterNodeId: "cc-2", amount: 30 }),
    ];
    const totals = sumActualsByCell(entries);
    expect(totals["acc-1"]["cc-1"]).toBe(150);
    expect(totals["acc-1"]["cc-2"]).toBe(30);
  });

  it("retorna objeto vazio para lista vazia", () => {
    expect(sumActualsByCell([])).toEqual({});
  });
});

describe("resolveTolerancePct", () => {
  it("usa o default (10%) quando não há nenhuma tolerância cadastrada", () => {
    expect(resolveTolerancePct([], "acc-1", "cc-1")).toBe(10);
  });

  it("prioriza a tolerância específica (conta + centro de custo) sobre as mais genéricas", () => {
    const tolerances = [
      makeTolerance({ accountNodeId: null, costCenterNodeId: null, thresholdValue: 5 }),
      makeTolerance({ accountNodeId: "acc-1", costCenterNodeId: null, thresholdValue: 8 }),
      makeTolerance({ accountNodeId: "acc-1", costCenterNodeId: "cc-1", thresholdValue: 15 }),
    ];
    expect(resolveTolerancePct(tolerances, "acc-1", "cc-1")).toBe(15);
  });

  it("cai para a tolerância por conta quando não há uma específica para a célula", () => {
    const tolerances = [makeTolerance({ accountNodeId: "acc-1", costCenterNodeId: null, thresholdValue: 8 })];
    expect(resolveTolerancePct(tolerances, "acc-1", "cc-9")).toBe(8);
  });

  it("cai para a tolerância global quando não há por conta nem por centro de custo", () => {
    const tolerances = [makeTolerance({ accountNodeId: null, costCenterNodeId: null, thresholdValue: 5 })];
    expect(resolveTolerancePct(tolerances, "acc-1", "cc-1")).toBe(5);
  });

  it("trata tolerância do tipo absoluto como 0% (qualquer desvio sinaliza)", () => {
    const tolerances = [makeTolerance({ thresholdType: "absoluto", thresholdValue: 500 })];
    expect(resolveTolerancePct(tolerances, "acc-1", "cc-1")).toBe(0);
  });
});
