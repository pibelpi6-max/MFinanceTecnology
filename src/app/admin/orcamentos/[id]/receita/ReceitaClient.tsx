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
import { ReceitaGrid, type GridChange, type GridRow } from "./ReceitaGrid";

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

  const [secClosed, setSecClosed] = useState<Set<string>>(new Set());
  const [labelOpen, setLabelOpen] = useState<Set<string>>(new Set());
  const flip = (set: Set<string>, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };

  const unifiedRows: GridRow[] = useMemo(() => {
    const rows: GridRow[] = [];
    const sumM = (f: (m: number) => number) => MONTHS.reduce((s, m) => s + f(m), 0);
    const gross = (pid: string, m: number) => aggregated[pid]?.[m]?.gross ?? 0;
    const roots = childrenOf.get(null) ?? [];
    const rootSum = (pick: (r: MonthResult | undefined, m: number) => number) => (m: number) =>
      roots.reduce((s, r) => s + pick(aggregated[r.id]?.[m], m), 0);
    const blank = () => "";

    const section = (id: string, label: string, cell: (m: number) => string, total: string) => {
      rows.push({
        key: `sec:${id}`, kind: "section", depth: 0, label, cell, total, strong: true,
        toggle: { open: !secClosed.has(id), onToggle: () => setSecClosed((s) => flip(s, id)) },
      });
      return !secClosed.has(id);
    };
    const tree = (id: string, mk: (r: ProductRow) => Partial<GridRow> & Pick<GridRow, "cell" | "total">) => {
      for (const r of visibleRows) {
        rows.push({
          key: `${id}:${r.id}`, kind: "row", depth: r.depth + 1, label: r.name,
          toggle: r.isLeaf ? undefined : { open: !collapsed.has(r.id), onToggle: () => toggleProduct(r.id) },
          ...mk(r),
        });
      }
    };
    const money2 = (n: number) => money.format(n);

    // Preço unitário (editável nos produtos folha)
    if (section("price", t("secPrice"), blank, "")) {
      tree("pr", (r) => {
        if (!r.isLeaf) return { cell: blank, total: "" };
        const nz = MONTHS.map((m) => num(getInput(r.id, m, "pr"))).filter((x) => x > 0);
        return {
          editable: { pid: r.id, field: "pr" },
          currency: { value: currencyOf(r.id), options: p.currencies, onChange: (c) => { setSaved(false); setCurrencyEdits((s) => ({ ...s, [r.id]: c })); } },
          cell: (m) => getInput(r.id, m, "pr"),
          total: nz.length ? money2(nz.reduce((a, b) => a + b, 0) / nz.length) : "",
        };
      });
    }
    // Volume
    if (section("vol", t("secVolume"), (m) => qty.format(rootSum((x) => x?.volume ?? 0)(m)), qty.format(sumM(rootSum((x) => x?.volume ?? 0))))) {
      tree("v", (r) => {
        const total = qty.format(sumM((m) => aggregated[r.id]?.[m]?.volume ?? 0));
        if (!r.isLeaf) return { cell: (m) => qty.format(aggregated[r.id]?.[m]?.volume ?? 0), total };
        return { editable: { pid: r.id, field: "v" }, cell: (m) => getInput(r.id, m, "v"), total };
      });
    }
    // Receita bruta
    const grossAt = (m: number) => toDisplay(rootSum((x) => x?.gross ?? 0)(m), m);
    if (section("gross", t("kpiGross"), (m) => money2(grossAt(m)), money2(sumM(grossAt)))) {
      tree("g", (r) => ({
        cell: (m) => money2(toDisplay(gross(r.id, m), m)),
        total: money2(sumM((m) => toDisplay(gross(r.id, m), m))),
      }));
    }
    // Deduções, abertas por tipo
    const dedAt = (m: number) => toDisplay(rootSum((x) => x?.deductions ?? 0)(m), m);
    if (section("ded", t("kpiDeductions"), (m) => money2(dedAt(m)), money2(sumM(dedAt)))) {
      const labelsList = Array.from(new Set(p.deductions.map((d) => d.label)));
      if (labelsList.length === 0) {
        rows.push({ key: "ded:none", kind: "note", depth: 1, label: t("noDeductionsHint"), cell: blank, total: "" });
      }
      for (const lb of labelsList) {
        const pct = (pid: string) => p.deductions.filter((d) => d.productId === pid && d.label === lb).reduce((s, d) => s + d.pct, 0);
        const pids = leaves.map((l) => l.id).filter((pid) => pct(pid) > 0);
        const val = (pid: string, m: number) => toDisplay((gross(pid, m) * pct(pid)) / 100, m);
        const open = labelOpen.has(lb);
        rows.push({
          key: `ded:${lb}`, kind: "row", depth: 1, label: lb,
          toggle: { open, onToggle: () => setLabelOpen((s) => flip(s, lb)) },
          cell: (m) => money2(pids.reduce((s, pid) => s + val(pid, m), 0)),
          total: money2(sumM((m) => pids.reduce((s, pid) => s + val(pid, m), 0))),
        });
        if (open) {
          for (const pid of pids) {
            const prod = p.products.find((x) => x.id === pid);
            rows.push({
              key: `ded:${lb}:${pid}`, kind: "row", depth: 2, label: `${prod?.name ?? ""} · ${String(pct(pid)).replace(".", ",")}%`,
              cell: (m) => money2(val(pid, m)),
              total: money2(sumM((m) => val(pid, m))),
            });
          }
        }
      }
    }
    // Receita líquida
    const netAt = (m: number) => toDisplay(rootSum((x) => x?.net ?? 0)(m), m);
    if (section("net", t("kpiNet"), (m) => money2(netAt(m)), money2(sumM(netAt)))) {
      tree("n", (r) => ({
        cell: (m) => money2(toDisplay(aggregated[r.id]?.[m]?.net ?? 0, m)),
        total: money2(sumM((m) => toDisplay(aggregated[r.id]?.[m]?.net ?? 0, m))),
      }));
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregated, childrenOf, visibleRows, collapsed, secClosed, labelOpen, edits, currencyEdits, baseLines, p.deductions, p.currencies, p.products, p.displayCurrency, p.rates, money, qty, leaves]);

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
  const monthLabels = MONTHS.map((m) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2000, m - 1, 1)));
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
          <ReceitaGrid
            rows={unifiedRows}
            monthLabels={monthLabels}
            readOnly={readOnly}
            labels={{ item: t("product"), currency: t("currency"), total: t("total") }}
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
