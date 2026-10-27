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
