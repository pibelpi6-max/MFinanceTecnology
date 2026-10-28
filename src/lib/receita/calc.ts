// Cálculo puro do módulo de Receita (sem I/O) — fácil de testar.

export const BASE_CURRENCY = "BRL";

export interface RevenueLine {
  productId: string;
  /** Estrutura (entidade) do lançamento; usada nas condições especiais. */
  entityId?: string | null;
  month: number; // 1..12
  currency: string;
  volume: number;
  unitPrice: number;
}

export interface Deduction {
  productId: string;
  code: string;
  label: string;
  pct: number; // 0..100
}

/** Condição especial: percentual diferente para uma parte da estrutura e/ou um produto. */
export interface DeductionRule {
  label: string;
  entityId: string | null;
  productId: string | null;
  pct: number;
}

/** Pais na hierarquia (id -> id do pai ou null), para valer também nos filhos. */
export interface RuleContext {
  entityParents: Record<string, string | null>;
  productParents: Record<string, string | null>;
}

/** [id, pai, avô, ...]: a posição é a distância (0 = o próprio nó). */
function lineage(id: string | null | undefined, parents: Record<string, string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | null | undefined = id;
  while (cur && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = parents[cur];
  }
  return out;
}

/** Percentual de uma dedução para uma linha: vale a condição mais específica, senão o padrão do item. */
export function effectivePct(
  base: Deduction,
  rules: DeductionRule[],
  ctx: RuleContext,
  entityId: string | null | undefined,
  productId: string,
): number {
  const eLine = lineage(entityId, ctx.entityParents);
  const pLine = lineage(productId, ctx.productParents);
  let best: { rank: [number, number, number]; pct: number } | null = null;
  for (const r of rules) {
    if (r.label.toLowerCase() !== base.label.toLowerCase()) continue;
    const ed = r.entityId ? eLine.indexOf(r.entityId) : -1;
    const pd = r.productId ? pLine.indexOf(r.productId) : -1;
    if (r.entityId && ed < 0) continue;
    if (r.productId && pd < 0) continue;
    // maior = mais específico: produto+estrutura (3) > estrutura (2) > produto (1); depois o nó mais próximo
    const kind = r.entityId && r.productId ? 3 : r.entityId ? 2 : 1;
    const rank: [number, number, number] = [kind, -(ed < 0 ? 0 : ed), -(pd < 0 ? 0 : pd)];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))) {
      best = { rank, pct: r.pct };
    }
  }
  return best ? best.pct : base.pct;
}

/** rates[currency][month] = taxa para BRL. BRL é sempre 1. */
export type RateTable = Record<string, Record<number, number>>;

export function rateFor(rates: RateTable, currency: string, month: number): number {
  if (currency === BASE_CURRENCY) return 1;
  return rates[currency]?.[month] ?? 0;
}

export interface MonthResult {
  gross: number;
  deductions: number;
  net: number;
  volume: number;
}

export const EMPTY_MONTH: MonthResult = { gross: 0, deductions: 0, net: 0, volume: 0 };

/** Receita bruta de uma linha na moeda base. */
export function grossOf(line: RevenueLine, rates: RateTable): number {
  return line.volume * line.unitPrice * rateFor(rates, line.currency, line.month);
}

export function deductionPct(deductions: Deduction[], productId: string): number {
  return deductions.filter((d) => d.productId === productId).reduce((s, d) => s + d.pct, 0);
}

/** Resultado por produto e mês (moeda base). */
export function computeByProduct(
  lines: RevenueLine[],
  deductions: Deduction[],
  rates: RateTable,
  rules: DeductionRule[] = [],
  ctx: RuleContext = { entityParents: {}, productParents: {} },
): Record<string, Record<number, MonthResult>> {
  const out: Record<string, Record<number, MonthResult>> = {};
  for (const l of lines) {
    const gross = grossOf(l, rates);
    const own = deductions.filter((d) => d.productId === l.productId);
    const pct = rules.length === 0 ? own.reduce((s, d) => s + d.pct, 0) : own.reduce((s, d) => s + effectivePct(d, rules, ctx, l.entityId, l.productId), 0);
    const ded = (gross * pct) / 100;
    const byMonth = (out[l.productId] ??= {});
    const cur = byMonth[l.month] ?? { ...EMPTY_MONTH };
    byMonth[l.month] = {
      gross: cur.gross + gross,
      deductions: cur.deductions + ded,
      net: cur.net + gross - ded,
      volume: cur.volume + l.volume,
    };
  }
  return out;
}

export function sumMonths(byMonth: Record<number, MonthResult> | undefined): MonthResult {
  const t = { ...EMPTY_MONTH };
  for (const m of Object.values(byMonth ?? {})) {
    t.gross += m.gross;
    t.deductions += m.deductions;
    t.net += m.net;
    t.volume += m.volume;
  }
  return t;
}

/** Margem de contribuição simples: (líquida - custo) / líquida; custo ainda não modelado → null. */
export function avgPrice(r: MonthResult): number {
  return r.volume > 0 ? r.gross / r.volume : 0;
}

// ---- Premissas ----

export function applyPriceAdjust(lines: RevenueLine[], pct: number, fromMonth: number, productId?: string): RevenueLine[] {
  return lines.map((l) =>
    l.month >= fromMonth && (!productId || l.productId === productId)
      ? { ...l, unitPrice: round4(l.unitPrice * (1 + pct / 100)) }
      : l
  );
}

/** Crescimento mensal composto de volume a partir de um mês-base (o mês-base não muda). */
export function applyVolumeGrowth(lines: RevenueLine[], monthlyPct: number, fromMonth: number, productId?: string): RevenueLine[] {
  return lines.map((l) =>
    l.month > fromMonth && (!productId || l.productId === productId)
      ? { ...l, volume: round4(l.volume * Math.pow(1 + monthlyPct / 100, l.month - fromMonth)) }
      : l
  );
}

/** Distribui um volume anual por sazonalidade (12 pesos). Pesos zerados → distribuição uniforme. */
export function distributeSeasonality(annualVolume: number, weights: number[]): number[] {
  const w = weights.length === 12 ? weights : new Array(12).fill(1);
  const total = w.reduce((s, x) => s + x, 0);
  const norm = total > 0 ? w : new Array(12).fill(1);
  const t = norm.reduce((s, x) => s + x, 0);
  return norm.map((x) => round4((annualVolume * x) / t));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
