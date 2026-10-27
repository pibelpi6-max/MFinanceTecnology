"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  EMPTY_MONTH, avgPrice, computeByProduct, rateFor, sumMonths,
  type Deduction, type MonthResult, type RateTable, type RevenueLine,
} from "@/lib/receita/calc";
import { applyAssumption, saveCurrencyRates, saveDeductions, saveRevenueEntries } from "./_actions";
import { ReceitaCharts } from "./ReceitaCharts";
import { ReceitaGrid, type GridChange, type GridCol, type GridRow } from "./ReceitaGrid";

export interface ProductRow {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  isLeaf: boolean;
}

interface Props {
  orcamentoId: string;
  year: number;
  products: ProductRow[];
  entities: { id: string; name: string }[];
  entityId: string; // "all" = consolidado (somente leitura)
  displayCurrency: string;
  currencies: string[];
  entries: (RevenueLine & { entityId: string | null })[];
  deductions: Deduction[];
  rates: RateTable;
}

type Tab = "unified" | "summary" | "deductions" | "fx" | "assumptions";
type Metric = "gross" | "deductions" | "net" | "volume" | "price";

const TOTAL_KEY = "__total";
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const num = (s: string | undefined) => {
  const raw = s ?? "";
  const n = parseFloat(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(n) ? n : 0;
};
const fmtInput = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

export function ReceitaClient(p: Props) {
  const t = useTranslations("receita");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("unified");
  const [metric, setMetric] = useState<Metric>("gross");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const readOnly = p.entityId === "all" && p.entities.length > 0;
  const entityKey = p.entities.length === 0 ? null : p.entityId === "all" ? null : p.entityId;

  const monthLabelsAll = MONTHS.map((m) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2000, m - 1, 1)));

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale]
  );
  const qty = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);

  // ---- Linhas do recorte atual (entidade) ----
  const baseLines = useMemo(
    () =>
      p.entries.filter((e) => (p.entityId === "all" ? true : p.entities.length === 0 ? true : e.entityId === p.entityId)),
    [p.entries, p.entityId, p.entities.length]
  );

  // edits[product][month] = {v,pr}
  const [edits, setEdits] = useState<Record<string, Record<number, { v?: string; pr?: string }>>>({});
  const [currencyEdits, setCurrencyEdits] = useState<Record<string, string>>({});
  const dirty = Object.keys(edits).length > 0 || Object.keys(currencyEdits).length > 0;

  const currencyOf = (productId: string) =>
    currencyEdits[productId] ?? baseLines.find((l) => l.productId === productId)?.currency ?? "BRL";

  // Linhas efetivas = banco + edições pendentes
  const lines: RevenueLine[] = useMemo(() => {
    const map = new Map<string, RevenueLine>();
    for (const l of baseLines) map.set(`${l.productId}:${l.month}`, { ...l, currency: currencyEdits[l.productId] ?? l.currency });
    for (const [pid, months] of Object.entries(edits)) {
      for (const [m, e] of Object.entries(months)) {
        const k = `${pid}:${m}`;
        const cur = map.get(k) ?? { productId: pid, month: Number(m), currency: currencyEdits[pid] ?? "BRL", volume: 0, unitPrice: 0 };
        map.set(k, {
          ...cur,
          currency: currencyEdits[pid] ?? cur.currency,
          volume: e.v !== undefined ? num(e.v) : cur.volume,
          unitPrice: e.pr !== undefined ? num(e.pr) : cur.unitPrice,
        });
      }
    }
    return Array.from(map.values());
  }, [baseLines, edits, currencyEdits]);

  const byProduct = useMemo(() => computeByProduct(lines, p.deductions, p.rates), [lines, p.deductions, p.rates]);

  // Agrega pais = soma dos descendentes
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, ProductRow[]>();
    for (const r of p.products) {
      const l = m.get(r.parentId) ?? [];
      l.push(r);
      m.set(r.parentId, l);
    }
    return m;
  }, [p.products]);

  const aggregated = useMemo(() => {
    const out: Record<string, Record<number, MonthResult>> = {};
    const walk = (id: string): Record<number, MonthResult> => {
      const kids = childrenOf.get(id) ?? [];
      if (kids.length === 0) return (out[id] = byProduct[id] ?? {});
      const acc: Record<number, MonthResult> = {};
      for (const k of kids) {
        const r = walk(k.id);
        for (const [m, v] of Object.entries(r)) {
          const c = acc[Number(m)] ?? { ...EMPTY_MONTH };
          acc[Number(m)] = { gross: c.gross + v.gross, deductions: c.deductions + v.deductions, net: c.net + v.net, volume: c.volume + v.volume };
        }
      }
      // Lançamentos diretos num pai (se existirem) também entram
      for (const [m, v] of Object.entries(byProduct[id] ?? {})) {
        const c = acc[Number(m)] ?? { ...EMPTY_MONTH };
        acc[Number(m)] = { gross: c.gross + v.gross, deductions: c.deductions + v.deductions, net: c.net + v.net, volume: c.volume + v.volume };
      }
      return (out[id] = acc);
    };
    for (const r of childrenOf.get(null) ?? []) walk(r.id);
    return out;
  }, [childrenOf, byProduct]);

  const totals = useMemo(() => {
    const acc: Record<number, MonthResult> = {};
    for (const r of childrenOf.get(null) ?? []) {
      for (const [m, v] of Object.entries(aggregated[r.id] ?? {})) {
        const c = acc[Number(m)] ?? { ...EMPTY_MONTH };
        acc[Number(m)] = { gross: c.gross + v.gross, deductions: c.deductions + v.deductions, net: c.net + v.net, volume: c.volume + v.volume };
      }
    }
    return acc;
  }, [childrenOf, aggregated]);

  // Conversão para a moeda de exibição
  const toDisplay = (brl: number, month: number) => {
    if (p.displayCurrency === "BRL") return brl;
    const r = rateFor(p.rates, p.displayCurrency, month);
    return r > 0 ? brl / r : 0;
  };

  const cellValue = (r: MonthResult | undefined, month: number): number => {
    const x = r ?? EMPTY_MONTH;
    switch (metric) {
      case "volume": return x.volume;
      case "price": return toDisplay(avgPrice(x), month);
      case "deductions": return toDisplay(x.deductions, month);
      case "net": return toDisplay(x.net, month);
      default: return toDisplay(x.gross, month);
    }
  };
  const totalValue = (by: Record<number, MonthResult> | undefined): number => {
    if (metric === "price") return avgPrice(sumMonths(by)); // preço médio em BRL/un (sem conversão anual)
    return MONTHS.reduce((s, m) => s + cellValue(by?.[m], m), 0);
  };
  const fmtCell = (n: number) => (metric === "volume" ? qty.format(n) : money.format(n));

  // Árvore: esconde descendentes de nós recolhidos
  const visibleRows = useMemo(() => {
    const hidden = new Set<string>();
    const out: ProductRow[] = [];
    for (const r of p.products) {
      if (r.parentId && (hidden.has(r.parentId) || collapsed.has(r.parentId))) {
        hidden.add(r.id);
        continue;
      }
      out.push(r);
    }
    return out;
  }, [p.products, collapsed]);

  const leaves = p.products.filter((r) => r.isLeaf);

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(search.toString());
    sp.set(key, value);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function toggleProduct(id: string) {
    setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function applyChanges(changes: GridChange[]) {
    setSaved(false);
    setEdits((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        const byMonth = { ...(next[c.pid] ?? {}) };
        byMonth[c.month] = { ...byMonth[c.month], [c.field]: c.value };
        next[c.pid] = byMonth;
      }
      return next;
    });
  }

  const getInput = (pid: string, month: number, field: "v" | "pr"): string => {
    const e = edits[pid]?.[month]?.[field];
    if (e !== undefined) return e;
    const l = baseLines.find((x) => x.productId === pid && x.month === month);
    return l ? fmtInput(field === "v" ? l.volume : l.unitPrice) : "";
  };

  // ---- Visão unificada: linhas = produtos; colunas = medida × período ----
  type Measure = "pr" | "v" | "gross" | "ded" | "net";
  type Period = "month" | "quarter" | "semester" | "year";
  const [shown, setShown] = useState<Set<Measure>>(new Set<Measure>(["pr", "v", "gross", "ded", "net"]));
  const [period, setPeriod] = useState<Period>("month");

  const leavesUnder = useMemo(() => {
    const memo = new Map<string, string[]>();
    const walk = (id: string): string[] => {
      const kids = childrenOf.get(id) ?? [];
      const own = kids.length === 0 ? [id] : kids.flatMap((k) => walk(k.id));
      memo.set(id, own);
      return own;
    };
    for (const r of childrenOf.get(null) ?? []) walk(r.id);
    memo.set(TOTAL_KEY, p.products.filter((r) => r.isLeaf).map((r) => r.id));
    return memo;
  }, [childrenOf, p.products]);

  const unifiedRows: GridRow[] = useMemo(() => {
    const rows: GridRow[] = visibleRows.map((r) => ({
      key: r.id,
      depth: r.depth,
      label: r.name,
      toggle: r.isLeaf ? undefined : { open: !collapsed.has(r.id), onToggle: () => toggleProduct(r.id) },
      pid: r.isLeaf ? r.id : undefined,
      currency: r.isLeaf
        ? { value: currencyOf(r.id), options: p.currencies, onChange: (c: string) => { setSaved(false); setCurrencyEdits((s) => ({ ...s, [r.id]: c })); } }
        : undefined,
    }));
    rows.push({ key: TOTAL_KEY, depth: 0, label: t("total"), strong: true });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, collapsed, currencyEdits, baseLines, p.currencies]);

  const unifiedCols: GridCol[] = useMemo(() => {
    const periods: { label: string; months: number[]; month?: number }[] =
      period === "month"
        ? MONTHS.map((m, i) => ({ label: monthLabelsAll[i], months: [m], month: m }))
        : period === "quarter"
          ? [0, 1, 2, 3].map((i) => ({ label: `${t("quarterPrefix")}${i + 1}`, months: MONTHS.slice(i * 3, i * 3 + 3) }))
          : period === "semester"
            ? [0, 1].map((i) => ({ label: `${t("semesterPrefix")}${i + 1}`, months: MONTHS.slice(i * 6, i * 6 + 6) }))
            : [];
    const money2 = (n: number) => money.format(n);
    const agg = (key: string) => (key === TOTAL_KEY ? totals : aggregated[key]);
    const sum = (months: number[], f: (m: number) => number) => months.reduce((s, m) => s + f(m), 0);
    const avgInput = (pid: string, months: number[]) => {
      const nz = months.map((m) => num(getInput(pid, m, "pr"))).filter((x) => x > 0);
      return nz.length ? money2(nz.reduce((a, b) => a + b, 0) / nz.length) : "";
    };

    type Def = {
      key: string; label: string; measure: Measure;
      text: (row: GridRow, months: number[], month?: number) => string;
    };
    const defs: Def[] = [];
    if (shown.has("pr")) {
      defs.push({
        key: "pr", label: t("secPrice"), measure: "pr",
        text: (row, months, month) => {
          if (!row.pid) return "";
          return month ? getInput(row.pid, month, "pr") : avgInput(row.pid, months);
        },
      });
    }
    if (shown.has("v")) {
      defs.push({
        key: "v", label: t("secVolume"), measure: "v",
        text: (row, months, month) => {
          if (row.pid && month) return getInput(row.pid, month, "v");
          return qty.format(sum(months, (m) => agg(row.key)?.[m]?.volume ?? 0));
        },
      });
    }
    if (shown.has("gross")) {
      defs.push({
        key: "gross", label: t("kpiGross"), measure: "gross",
        text: (row, months) => money2(sum(months, (m) => toDisplay(agg(row.key)?.[m]?.gross ?? 0, m))),
      });
    }
    if (shown.has("ded")) {
      const labelsList = Array.from(new Set(p.deductions.map((d) => d.label)));
      for (const lb of labelsList) {
        const pct = (pid: string) => p.deductions.filter((d) => d.productId === pid && d.label === lb).reduce((s, d) => s + d.pct, 0);
        defs.push({
          key: `ded:${lb}`, label: lb, measure: "ded",
          text: (row, months) => {
            const ids = leavesUnder.get(row.key) ?? [];
            return money2(sum(months, (m) => ids.reduce((s, pid) => s + toDisplay(((byProduct[pid]?.[m]?.gross ?? 0) * pct(pid)) / 100, m), 0)));
          },
        });
      }
    }
    if (shown.has("net")) {
      defs.push({
        key: "net", label: t("kpiNet"), measure: "net",
        text: (row, months) => money2(sum(months, (m) => toDisplay(agg(row.key)?.[m]?.net ?? 0, m))),
      });
    }

    const cols: GridCol[] = [];
    for (const d of defs) {
      for (const pd of periods) {
        cols.push({
          key: `${d.key}:${pd.label}`, groupKey: d.key, groupLabel: d.label, label: pd.label,
          editable: pd.month && (d.measure === "pr" || d.measure === "v") ? { field: d.measure === "pr" ? "pr" : "v", month: pd.month } : undefined,
          cell: (row) => d.text(row, pd.months, pd.month),
        });
      }
      cols.push({
        key: `${d.key}:total`, groupKey: d.key, groupLabel: d.label, label: t("total"), isTotal: true,
        cell: (row) => d.text(row, MONTHS),
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, period, aggregated, totals, byProduct, leavesUnder, edits, baseLines, p.deductions, p.displayCurrency, p.rates, money, qty]);

  const hasDeductions = p.deductions.length > 0;
  const toggleShown = (m: Measure) =>
    setShown((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });

  function save() {
    setError(null);
    const cells = lines
      .filter((l) => edits[l.productId]?.[l.month] || currencyEdits[l.productId])
      .map((l) => ({ productId: l.productId, month: l.month, volume: l.volume, unitPrice: l.unitPrice }));
    const currencyByProduct: Record<string, string> = {};
    for (const l of lines) currencyByProduct[l.productId] = l.currency;
    startTransition(async () => {
      const r = await saveRevenueEntries({ orcamentoId: p.orcamentoId, entityNodeId: entityKey, currencyByProduct, cells });
      if (r.error) return setError(r.error);
      setEdits({});
      setCurrencyEdits({});
      setSaved(true);
      router.refresh();
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "unified", label: t("tabUnified") },
    { id: "summary", label: t("tabSummary") },
    { id: "deductions", label: t("tabDeductions") },
    { id: "fx", label: t("tabFx") },
    { id: "assumptions", label: t("tabAssumptions") },
  ];
  const monthLabels = monthLabelsAll;
  const grand = sumMonths(totals);

  return (
    <div className="rec-wrap">
      <div className="rec-filters">
        {p.entities.length > 0 && <label>
          {t("entity")}
          <select value={p.entityId} onChange={(e) => setParam("entidade", e.target.value)} disabled={dirty}>
            {p.entities.length > 0 && <option value="all">{t("allEntities")}</option>}
            {p.entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>}
        <label>
          {t("displayCurrency")}
          <select value={p.displayCurrency} onChange={(e) => setParam("moeda", e.target.value)}>
            {p.currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="rec-kpis">
          <div><span>{t("kpiGross")}</span><strong>{money.format(MONTHS.reduce((s, m) => s + toDisplay(totals[m]?.gross ?? 0, m), 0))}</strong></div>
          <div><span>{t("kpiDeductions")}</span><strong>{money.format(MONTHS.reduce((s, m) => s + toDisplay(totals[m]?.deductions ?? 0, m), 0))}</strong></div>
          <div><span>{t("kpiNet")}</span><strong>{money.format(MONTHS.reduce((s, m) => s + toDisplay(totals[m]?.net ?? 0, m), 0))}</strong></div>
          <div><span>{t("kpiVolume")}</span><strong>{qty.format(grand.volume)}</strong></div>
        </div>
      </div>

      <div className="rec-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "active" : ""} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>

      {error && <div className="rec-error">{error}</div>}

      {tab === "unified" && (
        <>
          <div className="rec-entry-bar">
            <span>{readOnly ? t("selectEntityToEdit") : t("unifiedHint")}</span>
            <div>
              {dirty && <Button variant="ghost" size="sm" onClick={() => { setEdits({}); setCurrencyEdits({}); }}>{t("discard")}</Button>}
              <Button variant="primary" size="sm" onClick={save} disabled={!dirty || readOnly} isLoading={pending} loadingText={t("saving")}>
                {t("save")}
              </Button>
              {saved && !dirty && <span className="rec-saved">{t("saved")}</span>}
            </div>
          </div>
          <div className="rec-gridbar">
            <div>
              <span className="rec-gridbar-lbl">{t("showColumns")}</span>
              <div className="rec-metrics">
                {([["pr", t("secPrice")], ["v", t("secVolume")], ["gross", t("kpiGross")], ["ded", t("kpiDeductions")], ["net", t("kpiNet")]] as [Measure, string][]).map(([m, label]) => (
                  <button key={m} className={shown.has(m) ? "active" : ""} onClick={() => toggleShown(m)}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="rec-gridbar-lbl">{t("period")}</span>
              <div className="rec-metrics">
                {([["month", t("periodMonth")], ["quarter", t("periodQuarter")], ["semester", t("periodSemester")], ["year", t("periodYear")]] as [Period, string][]).map(([k, label]) => (
                  <button key={k} className={period === k ? "active" : ""} onClick={() => setPeriod(k)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          {period !== "month" && !readOnly && <p className="rec-hint">{t("periodEditHint")}</p>}
          {shown.has("ded") && !hasDeductions && <p className="rec-hint">{t("noDeductionsHint")}</p>}
          <ReceitaGrid
            rows={unifiedRows}
            cols={unifiedCols}
            readOnly={readOnly}
            labels={{ item: t("product"), currency: t("currency") }}
            onApply={applyChanges}
          />
        </>
      )}

      {tab === "summary" && (
        <>
          <div className="rec-metrics">
            {(["gross", "deductions", "net", "volume", "price"] as Metric[]).map((m) => (
              <button key={m} className={metric === m ? "active" : ""} onClick={() => setMetric(m)}>
                {t(`metric_${m}`)}
              </button>
            ))}
          </div>
          <div className="rec-scroll">
            <table className="rec-table">
              <thead>
                <tr>
                  <th className="rec-th-tree">{t("product")}</th>
                  {monthLabels.map((m, i) => <th key={i}>{m}</th>)}
                  <th className="rec-th-total">{metric === "price" ? t("average") : t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const by = aggregated[r.id];
                  const hasKids = !r.isLeaf;
                  return (
                    <tr key={r.id} className={hasKids ? "rec-parent" : ""}>
                      <td className="rec-td-tree" style={{ paddingLeft: 10 + r.depth * 18 }}>
                        {hasKids ? (
                          <button
                            className="rec-toggle"
                            aria-label={collapsed.has(r.id) ? t("expand") : t("collapse")}
                            onClick={() => toggleProduct(r.id)}
                          >
                            {collapsed.has(r.id) ? "▸" : "▾"}
                          </button>
                        ) : <span className="rec-toggle-gap" />}
                        {r.name}
                      </td>
                      {MONTHS.map((m) => <td key={m} className="rec-num">{fmtCell(cellValue(by?.[m], m))}</td>)}
                      <td className="rec-num rec-total">{fmtCell(totalValue(by))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="rec-td-tree">{t("total")}</td>
                  {MONTHS.map((m) => <td key={m} className="rec-num">{fmtCell(cellValue(totals[m], m))}</td>)}
                  <td className="rec-num rec-total">{fmtCell(totalValue(totals))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <ReceitaCharts
            months={monthLabels}
            net={MONTHS.map((m) => toDisplay(totals[m]?.net ?? 0, m))}
            deductions={MONTHS.map((m) => toDisplay(totals[m]?.deductions ?? 0, m))}
            products={(childrenOf.get(null) ?? []).map((r) => ({
              name: r.name,
              value: MONTHS.reduce((s, m) => s + toDisplay(aggregated[r.id]?.[m]?.gross ?? 0, m), 0),
            }))}
            labels={{ monthly: t("chartMonthly"), net: t("kpiNet"), deductions: t("kpiDeductions"), byProduct: t("chartByProduct"), empty: t("chartEmpty") }}
            format={(n) => money.format(n)}
          />
        </>
      )}

      {tab === "deductions" && (
        <DeductionsPanel orcamentoId={p.orcamentoId} leaves={leaves} deductions={p.deductions} onError={setError} />
      )}
      {tab === "fx" && <FxPanel orcamentoId={p.orcamentoId} rates={p.rates} onError={setError} />}
      {tab === "assumptions" && (
        <AssumptionsPanel orcamentoId={p.orcamentoId} entityKey={entityKey} readOnly={readOnly} leaves={leaves} onError={setError} />
      )}
    </div>
  );
}

const PRESETS = ["ICMS", "PIS", "COFINS", "ISS", "IPI"];

function DeductionsPanel({ orcamentoId, leaves, deductions, onError }: {
  orcamentoId: string; leaves: ProductRow[]; deductions: Deduction[]; onError: (s: string | null) => void;
}) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [productId, setProductId] = useState(leaves[0]?.id ?? "");
  const initial = (id: string) => deductions.filter((d) => d.productId === id).map((d) => ({ label: d.label, pct: fmtInput(d.pct) }));
  const [items, setItems] = useState(() => initial(leaves[0]?.id ?? ""));
  const [pending, start] = useTransition();
  const total = items.reduce((s, i) => s + num(i.pct), 0);

  if (leaves.length === 0) return <p className="rec-empty">{t("noProducts")}</p>;
  return (
    <div className="rec-panel">
      <p className="rec-hint">{t("deductionsHint")}</p>
      <label className="rec-field">
        {t("product")}
        <select value={productId} onChange={(e) => { setProductId(e.target.value); setItems(initial(e.target.value)); }}>
          {leaves.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {items.map((it, i) => (
        <div className="rec-ded-row" key={i}>
          <input value={it.label} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={t("deductionName")} />
          <input inputMode="decimal" value={it.pct} onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && setItems((s) => s.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} placeholder="%" />
          <span>%</span>
          <button className="rec-link" onClick={() => setItems((s) => s.filter((_, j) => j !== i))}>{t("remove")}</button>
        </div>
      ))}
      <div className="rec-presets">
        {PRESETS.filter((x) => !items.some((i) => i.label === x)).map((x) => (
          <button key={x} className="rec-chip" onClick={() => setItems((s) => [...s, { label: x, pct: "" }])}>+ {x}</button>
        ))}
        <button className="rec-chip" onClick={() => setItems((s) => [...s, { label: "", pct: "" }])}>+ {t("other")}</button>
      </div>
      <div className="rec-ded-total">{t("totalDeductions")}: <strong>{total.toFixed(2).replace(".", ",")}%</strong></div>
      <Button
        variant="primary" size="sm" isLoading={pending} loadingText={t("saving")}
        onClick={() => start(async () => {
          onError(null);
          const r = await saveDeductions({ orcamentoId, productId, items: items.map((i) => ({ code: i.label, label: i.label, pct: num(i.pct) })) });
          if (r.error) onError(r.error); else router.refresh();
        })}
      >{t("save")}</Button>
    </div>
  );
}

function FxPanel({ orcamentoId, rates, onError }: { orcamentoId: string; rates: RateTable; onError: (s: string | null) => void }) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [currency, setCurrency] = useState(Object.keys(rates)[0] ?? "USD");
  const [vals, setVals] = useState<string[]>(() => MONTHS.map((m) => fmtInput(rates[Object.keys(rates)[0] ?? "USD"]?.[m] ?? 0)));
  const [pending, start] = useTransition();
  const pick = (c: string) => { setCurrency(c); setVals(MONTHS.map((m) => fmtInput(rates[c]?.[m] ?? 0))); };
  return (
    <div className="rec-panel">
      <p className="rec-hint">{t("fxHint")}</p>
      <div className="rec-fx-head">
        <label className="rec-field">
          {t("currency")}
          <input value={currency} maxLength={3} onChange={(e) => pick(e.target.value.toUpperCase())} list="rec-cur-list" />
          <datalist id="rec-cur-list">{Object.keys(rates).map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <button className="rec-chip" onClick={() => setVals((s) => s.map(() => s[0]))}>{t("fillAll")}</button>
      </div>
      <div className="rec-fx-grid">
        {MONTHS.map((m, i) => (
          <label key={m} className="rec-field">
            {new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(2000, m - 1, 1))}
            <input inputMode="decimal" value={vals[i]} placeholder="0,0000" onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && setVals((s) => s.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </div>
      <Button
        variant="primary" size="sm" isLoading={pending} loadingText={t("saving")}
        onClick={() => start(async () => {
          onError(null);
          const r = await saveCurrencyRates({ orcamentoId, currency, rates: vals.map(num) });
          if (r.error) onError(r.error); else router.refresh();
        })}
      >{t("save")}</Button>
    </div>
  );
}

function AssumptionsPanel({ orcamentoId, entityKey, readOnly, leaves, onError }: {
  orcamentoId: string; entityKey: string | null; readOnly: boolean; leaves: ProductRow[]; onError: (s: string | null) => void;
}) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [kind, setKind] = useState<"price_adjust" | "volume_growth">("price_adjust");
  const [pct, setPct] = useState("");
  const [from, setFrom] = useState(1);
  const [product, setProduct] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="rec-panel">
      <p className="rec-hint">{readOnly ? t("selectEntityToEdit") : t("assumptionsHint")}</p>
      <div className="rec-assump">
        <label className="rec-field">{t("assumption")}
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="price_adjust">{t("priceAdjust")}</option>
            <option value="volume_growth">{t("volumeGrowth")}</option>
          </select>
        </label>
        <label className="rec-field">{kind === "price_adjust" ? t("pctAdjust") : t("pctGrowth")}
          <input inputMode="decimal" value={pct} onChange={(e) => /^-?\d*[.,]?\d*$/.test(e.target.value) && setPct(e.target.value)} placeholder="0,0" />
        </label>
        <label className="rec-field">{t("fromMonth")}
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {MONTHS.map((m) => <option key={m} value={m}>{new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2000, m - 1, 1))}</option>)}
          </select>
        </label>
        <label className="rec-field">{t("product")}
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">{t("allProducts")}</option>
            {leaves.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
      <Button
        variant="primary" size="sm" disabled={readOnly || pct === ""} isLoading={pending} loadingText={t("applying")}
        onClick={() => start(async () => {
          onError(null); setDone(false);
          const r = await applyAssumption({ orcamentoId, entityNodeId: entityKey, kind, pct: parseFloat(pct.replace(",", ".")), fromMonth: from, productId: product || null });
          if (r.error) onError(r.error); else { setDone(true); router.refresh(); }
        })}
      >{t("apply")}</Button>
      {done && <span className="rec-saved">{t("applied")}</span>}
    </div>
  );
}
