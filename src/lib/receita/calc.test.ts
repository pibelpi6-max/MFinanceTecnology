import { describe, it, expect } from "vitest";
import {
  computeByProduct, sumMonths, applyPriceAdjust, applyVolumeGrowth, distributeSeasonality, rateFor,
  type RevenueLine, type Deduction,
} from "./calc";

const lines: RevenueLine[] = [
  { productId: "A", month: 1, currency: "BRL", volume: 100, unitPrice: 10 },
  { productId: "A", month: 2, currency: "BRL", volume: 50, unitPrice: 10 },
  { productId: "B", month: 1, currency: "USD", volume: 10, unitPrice: 100 },
];
const deds: Deduction[] = [
  { productId: "A", code: "icms", label: "ICMS", pct: 18 },
  { productId: "A", code: "pis", label: "PIS", pct: 1.65 },
];

describe("receita/calc", () => {
  it("BRL tem taxa 1 e moeda sem taxa vira 0", () => {
    expect(rateFor({}, "BRL", 3)).toBe(1);
    expect(rateFor({}, "USD", 3)).toBe(0);
  });
  it("calcula bruta, deduções e líquida por produto/mês", () => {
    const r = computeByProduct(lines, deds, { USD: { 1: 5 } });
    expect(r.A[1].gross).toBe(1000);
    expect(r.A[1].deductions).toBeCloseTo(196.5, 6);
    expect(r.A[1].net).toBeCloseTo(803.5, 6);
    expect(r.B[1].gross).toBe(5000);
    expect(r.B[1].net).toBe(5000);
  });
  it("soma os meses", () => {
    const t = sumMonths(computeByProduct(lines, deds, {}).A);
    expect(t.gross).toBe(1500);
    expect(t.volume).toBe(150);
  });
  it("reajusta preço a partir do mês", () => {
    const r = applyPriceAdjust(lines, 10, 2, "A");
    expect(r[0].unitPrice).toBe(10);
    expect(r[1].unitPrice).toBe(11);
    expect(r[2].unitPrice).toBe(100);
  });
  it("crescimento composto de volume", () => {
    const r = applyVolumeGrowth(
      [{ productId: "A", month: 1, currency: "BRL", volume: 100, unitPrice: 1 }, { productId: "A", month: 3, currency: "BRL", volume: 100, unitPrice: 1 }],
      10, 1);
    expect(r[0].volume).toBe(100);
    expect(r[1].volume).toBe(121);
  });
  it("sazonalidade soma o volume anual", () => {
    const d = distributeSeasonality(1200, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3]);
    expect(d.reduce((s, x) => s + x, 0)).toBeCloseTo(1200, 2);
    expect(d[11]).toBeGreaterThan(d[0]);
    expect(distributeSeasonality(120, []).every((x) => x === 10)).toBe(true);
  });
});

import { effectivePct, computeByProduct as computeRules, type DeductionRule } from "./calc";

describe("condições especiais por estrutura", () => {
  const ctx = {
    entityParents: { sp: "sudeste", rj: "sudeste", sudeste: null, ba: null },
    productParents: { p1: "grp", grp: null },
  };
  const base = { productId: "p1", code: "", label: "ICMS", pct: 18 };
  const r = (entityId: string | null, productId: string | null, pct: number): DeductionRule => ({ label: "ICMS", entityId, productId, pct });

  it("a venda pode carregar várias dimensões: a condição vale em qualquer uma delas", () => {
    expect(effectivePct(base, [r("varejo", null, 12)], { ...ctx, entityParents: { ...ctx.entityParents, varejo: null } }, ["sp", "varejo"], "p1")).toBe(12);
    expect(effectivePct(base, [r("ba", null, 12)], ctx, ["sp", "varejo"], "p1")).toBe(18);
  });

  it("sem condição vale o padrão do item", () => {
    expect(effectivePct(base, [], ctx, "sp", "p1")).toBe(18);
    expect(effectivePct(base, [r("ba", null, 20)], ctx, "sp", "p1")).toBe(18);
  });
  it("vale também para os filhos da estrutura", () => {
    expect(effectivePct(base, [r("sudeste", null, 12)], ctx, "sp", "p1")).toBe(12);
  });
  it("estrutura + produto vence estrutura, que vence produto", () => {
    const rules = [r(null, "p1", 5), r("sp", null, 12), r("sp", "p1", 9)];
    expect(effectivePct(base, rules, ctx, "sp", "p1")).toBe(9);
    expect(effectivePct(base, rules.slice(0, 2), ctx, "sp", "p1")).toBe(12);
    expect(effectivePct(base, [rules[0]], ctx, "ba", "p1")).toBe(5);
  });
  it("o nó mais próximo vence o ancestral", () => {
    expect(effectivePct(base, [r("sudeste", null, 12), r("sp", null, 14)], ctx, "sp", "p1")).toBe(14);
  });
  it("aplica no cálculo da receita líquida", () => {
    const lines = [{ productId: "p1", entityId: "rj", month: 1, currency: "BRL", volume: 10, unitPrice: 100 }];
    const out = computeRules(lines, [base], {}, [r("rj", null, 20)], ctx);
    expect(out.p1[1].deductions).toBeCloseTo(200);
    expect(out.p1[1].net).toBeCloseTo(800);
  });
});

import { applyPremises, type Premise, type PremiseContext } from "./calc";

describe("premissas guardadas", () => {
  const ctx: PremiseContext = {
    entityTypeId: "unid",
    entityParents: { cwb: "pr", pr: null },
    productParents: { a1: "famA", a2: "famA", b1: "famB", famA: null, famB: null },
    nodeParents: { varejo: "canais", canais: null },
  };
  const mk = (productId: string, month: number, volume = 100, unitPrice = 10, extra: Partial<{ entityId: string; dims: Record<string, string> }> = {}) => ({
    productId, month, currency: "BRL", volume, unitPrice, ...extra,
  });
  const base: Premise = { kind: "volume_growth", pct: 10, fromMonth: 1, base: "entered", productIds: [], dimensionFilters: {} };

  it("cresce em cima do lançado, a partir do mês-base (que não muda)", () => {
    const r = applyPremises([mk("a1", 1), mk("a1", 2), mk("a1", 3)], [base], ctx);
    expect(r.map((l) => l.volume)).toEqual([100, 110, 121]);
  });

  it("encadeia no mês anterior", () => {
    const r = applyPremises([mk("a1", 1), mk("a1", 2, 999), mk("a1", 3, 999)], [{ ...base, base: "previous_month" }], ctx);
    expect(r.map((l) => l.volume)).toEqual([100, 110, 121]);
  });

  it("filtra por família: vale nos filhos, não nos outros", () => {
    const r = applyPremises([mk("a1", 2), mk("b1", 2)], [{ ...base, productIds: ["famA"] }], ctx);
    expect(r.find((l) => l.productId === "a1")!.volume).toBe(110);
    expect(r.find((l) => l.productId === "b1")!.volume).toBe(100);
  });

  it("filtra por dimensão: a lançada (entidade, com filhos) e outra (dims)", () => {
    const lines = [mk("a1", 2, 100, 10, { entityId: "cwb", dims: { canal: "varejo" } }), mk("a2", 2, 100, 10, { entityId: "sp", dims: { canal: "atacado" } })];
    const porUnidade = applyPremises(lines, [{ ...base, dimensionFilters: { unid: ["pr"] } }], ctx);
    expect(porUnidade.map((l) => l.volume)).toEqual([110, 100]);
    const porCanal = applyPremises(lines, [{ ...base, dimensionFilters: { canal: ["varejo"] } }], ctx);
    expect(porCanal.map((l) => l.volume)).toEqual([110, 100]);
  });

  it("filtro de dimensão que a linha não tem não aplica", () => {
    const r = applyPremises([mk("a1", 2)], [{ ...base, dimensionFilters: { canal: ["varejo"] } }], ctx);
    expect(r[0].volume).toBe(100);
  });

  it("reajuste de preço vale do mês em diante e não mexe no volume", () => {
    const r = applyPremises([mk("a1", 1), mk("a1", 2)], [{ ...base, kind: "price_adjust", pct: 5, fromMonth: 2 }], ctx);
    expect(r.map((l) => l.unitPrice)).toEqual([10, 10.5]);
    expect(r.map((l) => l.volume)).toEqual([100, 100]);
  });
});
