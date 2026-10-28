"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PremiseRow } from "@/lib/receita/queries";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  EMPTY_MONTH, applyPremises, avgPrice, computeByProduct, rateFor, sumMonths,
  lineage, type Deduction, type MonthResult, type RateTable, type RevenueLine, type DeductionRule,
} from "@/lib/receita/calc";
import { TreeMultiSelect, type TreeMultiSelectLabels, type TreeSelectGroup } from "@/components/ui/tree/TreeMultiSelect";
import { deletePremise, savePremise, setPremiseActive, saveDeductionDefaults, saveDeductionRules, saveRevenueEntries } from "./_actions";
import { ReceitaCharts } from "./ReceitaCharts";
import type { TablePrefs } from "@/components/ui/DataTable/types";
import { TreeSelect } from "@/components/ui/tree/TreeSelect";
import { ProdutosPanel } from "./ProdutosPanel";
import { ReceitaGrid, type GridChange, type GridCol, type GridRow } from "./ReceitaGrid";

export interface ProductRow {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  isLeaf: boolean;
  code: string;
  /** Serviço não tem vínculo com ficha técnica (Custos). */
  kind: "produto" | "servico";
  versionId: string;
  validFromYear: number;
}

interface Props {
  orcamentoId: string;
  year: number;
  productTypeId: string;
  productPrefs?: TablePrefs;
  deductionLabels?: string[];
  deductionDefaults?: { label: string; pct: number }[];
  products: ProductRow[];
  dimensions: { id: string; name: string }[];
  /** Itens de cada hierarquia (com nível), para os seletores de recorte. */
  dimNodes: Record<string, { id: string; name: string; depth: number; parentId: string | null }[]>;
  /** Hierarquias salvas no orçamento ("cada venda leva"); vazio = detectar pelos lançamentos. */
  savedCarried: string[];
  defaultTypeId: string | null;
  ruleGroups: TreeSelectGroup[];
  premises?: PremiseRow[];
  budgetOptions?: { id: string; label: string; year: number }[];
  /** Lançamentos de outros orçamentos usados como base de premissas. */
  refEntries?: Record<string, (RevenueLine & { entityId: string | null; extra: Record<string, string> })[]>;
  deductionRules?: DeductionRule[];
  displayCurrency: string;
  currencies: string[];
  /** Moedas cadastradas em Parâmetros (sugeridas no câmbio). */
  companyCurrencies?: string[];
  entries: (RevenueLine & { entityId: string | null; extra: Record<string, string> })[];
  deductions: Deduction[];
  rates: RateTable;
}

type Tab = "params" | "assumptions" | "entry" | "analysis";
type ParamTab = "products" | "deductions";

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
  const [tab, setTab] = useState<Tab>("entry");
  const [paramTab, setParamTab] = useState<ParamTab>("deductions");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ---- Hierarquias que cada venda carrega e o recorte em tela ----
  const nodeType = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of p.ruleGroups) for (const it of g.items) m[it.id] = g.typeId;
    return m;
  }, [p.ruleGroups]);
  const nodeParents = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const g of p.ruleGroups) for (const it of g.items) m[it.id] = it.parentId ?? null;
    return m;
  }, [p.ruleGroups]);
  const dimOrder = useMemo(() => p.dimensions.map((d) => d.id), [p.dimensions]);
  const entriesDims = useMemo(
    () =>
      p.entries.map((e) => {
        const dims: Record<string, string> = { ...e.extra };
        if (e.entityId && nodeType[e.entityId]) dims[nodeType[e.entityId]] = e.entityId;
        return { e, dims };
      }),
    [p.entries, nodeType]
  );
  const carried = useMemo(() => {
    if (p.savedCarried.length > 0) return dimOrder.filter((id) => p.savedCarried.includes(id));
    const used = new Set<string>();
    for (const x of entriesDims) for (const k of Object.keys(x.dims)) used.add(k);
    const ids = dimOrder.filter((id) => used.has(id));
    if (ids.length > 0) return ids;
    return p.defaultTypeId ? [p.defaultTypeId] : [];
  }, [p.savedCarried, dimOrder, entriesDims, p.defaultTypeId]);
  const selOf = (typeId: string): string => {
    const v = search.get(`s_${typeId}`);
    const nodes = p.dimNodes[typeId] ?? [];
    if (v === "all") return "all";
    if (v && nodes.some((n) => n.id === v)) return v;
    return nodes[0]?.id ?? "all";
  };
  const sel: Record<string, string> = Object.fromEntries(carried.map((id) => [id, selOf(id)]));
  const selKey = carried.map((id) => sel[id]).join("|");
  // Consolidado (algum "Todos") é só leitura; para lançar, um item em cada hierarquia.
  const readOnly = carried.length > 0 && carried.some((id) => sel[id] === "all");
  const entityKey = carried.length === 0 || readOnly ? null : sel[carried[0]];
  const extraKey: Record<string, string> = readOnly ? {} : Object.fromEntries(carried.slice(1).map((id) => [id, sel[id]]));
  const sliceDims: Record<string, string> = readOnly ? {} : Object.fromEntries(carried.map((id) => [id, sel[id]]));
  const dimsKey = (d: Record<string, string> | undefined) => JSON.stringify(Object.entries(d ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));

  // Ordem das hierarquias (arrastável): define o aninhamento dos grupos na tabela consolidada.
  const orderParam = (search.get("ord") ?? "").split(",").filter(Boolean);
  const order = [...orderParam.filter((id) => carried.includes(id)), ...carried.filter((id) => !orderParam.includes(id))];
  const groupDims = readOnly ? order.filter((id) => sel[id] === "all") : [];
  const groupKeyStr = groupDims.join(",");
  const [dragId, setDragId] = useState<string | null>(null);
  function reorder(from: string, to: string) {
    if (from === to) return;
    const next = order.filter((id) => id !== from);
    next.splice(next.indexOf(to), 0, from);
    setParam("ord", next.join(","));
  }

  const monthLabelsAll = MONTHS.map((m) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2000, m - 1, 1)));

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale]
  );
  const qty = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);

  // ---- Linhas do recorte atual (entidade) ----
  const baseLines = useMemo(
    () =>
      entriesDims
        .filter(({ dims }) => {
          if (carried.length === 0) return true;
          // Para lançar: exatamente o recorte escolhido. Consolidado: soma tudo que cai dentro (por linhagem).
          if (!readOnly) return carried.every((id) => dims[id] === sel[id]) && Object.keys(dims).every((k) => carried.includes(k));
          return carried.every((id) => sel[id] === "all" || (!!dims[id] && lineage(dims[id], nodeParents).includes(sel[id])));
        })
        .map(({ e, dims }) => ({ ...e, dims })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entriesDims, carried, readOnly, selKey, nodeParents]
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
    for (const l of baseLines) map.set(`${l.productId}:${dimsKey(l.dims)}:${l.month}`, { ...l, currency: currencyEdits[l.productId] ?? l.currency });
    for (const [pid, months] of Object.entries(edits)) {
      for (const [m, e] of Object.entries(months)) {
        const k = `${pid}:${dimsKey(sliceDims)}:${m}`;
        const cur = map.get(k) ?? { productId: pid, entityId: entityKey, dims: sliceDims, month: Number(m), currency: currencyEdits[pid] ?? "BRL", volume: 0, unitPrice: 0 };
        map.set(k, {
          ...cur,
          currency: currencyEdits[pid] ?? cur.currency,
          volume: e.v !== undefined ? num(e.v) : cur.volume,
          unitPrice: e.pr !== undefined ? num(e.pr) : cur.unitPrice,
        });
      }
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLines, edits, currencyEdits, entityKey, selKey]);

  const ruleCtx = useMemo(() => ({
    entityParents: nodeParents,
    productParents: Object.fromEntries(p.products.map((x) => [x.id, x.parentId ?? null])),
  }), [nodeParents, p.products]);
  // Premissas guardadas: aplicadas por cima do lançado (o lançado não muda).
  const refLines = useMemo(() => {
    const out: Record<string, RevenueLine[]> = {};
    for (const [oid, list] of Object.entries(p.refEntries ?? {})) {
      out[oid] = list.map((e) => {
        const dims: Record<string, string> = { ...e.extra };
        if (e.entityId && nodeType[e.entityId]) dims[nodeType[e.entityId]] = e.entityId;
        return { ...e, dims };
      });
    }
    return out;
  }, [p.refEntries, nodeType]);
  const premiseCtx = useMemo(() => ({ ...ruleCtx, entityTypeId: null, nodeParents, refLines }), [ruleCtx, nodeParents, refLines]);
  const activePremises = useMemo(
    () => (p.premises ?? []).filter((x) => x.isActive).map((x) => ({ kind: x.kind, pct: x.pct, fromMonth: x.fromMonth, base: x.base, baseOrcamentoId: x.baseOrcamentoId, productIds: x.productIds, dimensionFilters: x.dimensionFilters })),
    [p.premises],
  );
  const premisedLines = useMemo(() => applyPremises(lines, activePremises, premiseCtx), [lines, activePremises, premiseCtx]);
  const byProduct = useMemo(
    () => computeByProduct(premisedLines, p.deductions, p.rates, p.deductionRules ?? [], ruleCtx),
    [premisedLines, p.deductions, p.rates, p.deductionRules, ruleCtx],
  );

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

  const aggregateOf = (bp: Record<string, Record<number, MonthResult>>) => {
    const out: Record<string, Record<number, MonthResult>> = {};
    const add = (acc: Record<number, MonthResult>, r: Record<number, MonthResult>) => {
      for (const [m, v] of Object.entries(r)) {
        const c = acc[Number(m)] ?? { ...EMPTY_MONTH };
        acc[Number(m)] = { gross: c.gross + v.gross, deductions: c.deductions + v.deductions, net: c.net + v.net, volume: c.volume + v.volume };
      }
    };
    const walk = (id: string): Record<number, MonthResult> => {
      const kids = childrenOf.get(id) ?? [];
      if (kids.length === 0) return (out[id] = bp[id] ?? {});
      const acc: Record<number, MonthResult> = {};
      for (const k of kids) add(acc, walk(k.id));
      add(acc, bp[id] ?? {}); // lançamentos diretos num pai
      return (out[id] = acc);
    };
    for (const r of childrenOf.get(null) ?? []) walk(r.id);
    const tot: Record<number, MonthResult> = {};
    for (const r of childrenOf.get(null) ?? []) add(tot, out[r.id] ?? {});
    return { agg: out, totals: tot };
  };
  const { agg: aggregated, totals } = useMemo(() => aggregateOf(byProduct), [childrenOf, byProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // Conversão para a moeda de exibição
  const toDisplay = (brl: number, month: number) => {
    if (p.displayCurrency === "BRL") return brl;
    const r = rateFor(p.rates, p.displayCurrency, month);
    return r > 0 ? brl / r : 0;
  };


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

  function setSel(typeId: string, value: string) {
    setParam(`s_${typeId}`, value);
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
    if (readOnly) {
      // Consolidado: soma dos recortes (preço = média ponderada pelo volume).
      const ls = premisedLines.filter((x) => x.productId === pid && x.month === month);
      if (ls.length === 0) return "";
      const vol = ls.reduce((a, x) => a + x.volume, 0);
      if (field === "v") return fmtInput(vol);
      const pr = vol > 0 ? ls.reduce((a, x) => a + x.unitPrice * x.volume, 0) / vol : ls.reduce((a, x) => a + x.unitPrice, 0) / ls.length;
      return fmtInput(Math.round(pr * 10000) / 10000);
    }
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

  // Consolidado agrupado: a ordem das hierarquias vira níveis (tree view); produtos ficam por dentro.
  type GData = { lines: RevenueLine[]; byProduct: Record<string, Record<number, MonthResult>>; agg: Record<string, Record<number, MonthResult>>; totals: Record<number, MonthResult> };
  type GEntry = { key: string; parentKey: string | null; depth: number; label: string; gid: string; prod?: string; hasKids: boolean };
  const grouped = useMemo(() => {
    if (groupDims.length === 0 || tab === "params" || tab === "assumptions") return null;
    const data = new Map<string, GData>();
    const entries: GEntry[] = [];
    const dataOf = (gid: string, ls: RevenueLine[]) => {
      if (!data.has(gid)) {
        const bp = computeByProduct(ls, p.deductions, p.rates, p.deductionRules ?? [], ruleCtx);
        data.set(gid, { lines: ls, byProduct: bp, ...aggregateOf(bp) });
      }
    };
    const build = (ls: RevenueLine[], idx: number, depth: number, prefix: string, parentKey: string | null) => {
      if (idx >= groupDims.length) {
        const present = new Set(ls.map((l) => l.productId));
        for (const r of p.products) {
          const leaves = leavesUnder.get(r.id) ?? [];
          if (!leaves.some((x) => present.has(x))) continue;
          entries.push({ key: `${prefix}|p:${r.id}`, parentKey: r.parentId && (leavesUnder.get(r.parentId) ?? []).some((x) => present.has(x)) ? `${prefix}|p:${r.parentId}` : parentKey, depth: depth + r.depth, label: r.name, gid: prefix, prod: r.id, hasKids: !r.isLeaf });
        }
        return;
      }
      const d = groupDims[idx];
      const has = new Set<string>();
      for (const l of ls) for (const n of lineage(l.dims?.[d], nodeParents)) has.add(n);
      const nodes = (p.dimNodes[d] ?? []).filter((n) => has.has(n.id));
      for (const n of nodes) {
        const gid = `${prefix}|${d}:${n.id}`;
        const sub = ls.filter((l) => lineage(l.dims?.[d], nodeParents).includes(n.id));
        dataOf(gid, sub);
        const leafNode = !nodes.some((x) => nodeParents[x.id] === n.id);
        const par = nodeParents[n.id] && has.has(nodeParents[n.id] as string) ? `${prefix}|${d}:${nodeParents[n.id]}` : parentKey;
        entries.push({ key: gid, parentKey: par, depth: depth + n.depth, label: n.name, gid, hasKids: true });
        if (leafNode) build(sub, idx + 1, depth + n.depth + 1, gid, gid);
      }
      const none = ls.filter((l) => !l.dims?.[d]);
      if (none.length) {
        const gid = `${prefix}|${d}:none`;
        dataOf(gid, none);
        entries.push({ key: gid, parentKey, depth, label: "—", gid, hasKids: true });
        build(none, idx + 1, depth + 1, gid, gid);
      }
    };
    build(premisedLines, 0, 0, "g", null);
    return { data, entries };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeyStr, premisedLines, tab, p.products, p.dimNodes, nodeParents, leavesUnder, p.deductions, p.rates, p.deductionRules, ruleCtx, childrenOf]);

  const unifiedRows: GridRow[] = useMemo(() => {
    let rows: GridRow[];
    if (grouped) {
      const hidden = new Set<string>();
      rows = [];
      for (const e of grouped.entries) {
        if (e.parentKey && (hidden.has(e.parentKey) || collapsed.has(e.parentKey))) {
          hidden.add(e.key);
          continue;
        }
        rows.push({
          key: e.key, depth: e.depth, label: e.label, gid: e.gid, prod: e.prod,
          toggle: e.hasKids && !(e.prod && (leavesUnder.get(e.prod) ?? []).length === 1 && leavesUnder.get(e.prod)?.[0] === e.prod)
            ? { open: !collapsed.has(e.key), onToggle: () => toggleProduct(e.key) }
            : undefined,
        });
      }
    } else {
      rows = visibleRows.map((r) => ({
        key: r.id,
        depth: r.depth,
        label: r.name,
        toggle: r.isLeaf ? undefined : { open: !collapsed.has(r.id), onToggle: () => toggleProduct(r.id) },
        pid: r.isLeaf ? r.id : undefined,
        currency: r.isLeaf
          ? { value: currencyOf(r.id), options: p.currencies, onChange: (c: string) => { setSaved(false); setCurrencyEdits((s) => ({ ...s, [r.id]: c })); } }
          : undefined,
      }));
    }
    rows.push({ key: TOTAL_KEY, depth: 0, label: t("total"), strong: true });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, collapsed, currencyEdits, baseLines, p.currencies, grouped, leavesUnder]);

  const makeCols = (shown: Set<Measure>, period: Period): GridCol[] => {
    const periods: { label: string; months: number[]; month?: number }[] =
      period === "month"
        ? MONTHS.map((m, i) => ({ label: monthLabelsAll[i], months: [m], month: m }))
        : period === "quarter"
          ? [0, 1, 2, 3].map((i) => ({ label: `${t("quarterPrefix")}${i + 1}`, months: MONTHS.slice(i * 3, i * 3 + 3) }))
          : period === "semester"
            ? [0, 1].map((i) => ({ label: `${t("semesterPrefix")}${i + 1}`, months: MONTHS.slice(i * 6, i * 6 + 6) }))
            : [];
    const money2 = (n: number) => money.format(n);
    const gdOf = (row: GridRow) => (row.gid !== undefined ? grouped?.data.get(row.gid) : undefined);
    const agg = (row: GridRow) => {
      const g = gdOf(row);
      if (g) return row.prod ? g.agg[row.prod] : g.totals;
      return row.key === TOTAL_KEY ? totals : aggregated[row.key];
    };
    const isLeafProd = (id?: string) => !!id && (leavesUnder.get(id) ?? []).length === 1 && leavesUnder.get(id)?.[0] === id;
    const sum = (months: number[], f: (m: number) => number) => months.reduce((s, m) => s + f(m), 0);
    const avgInput = (pid: string, months: number[]) => {
      const nz = months.map((m) => num(getInput(pid, m, "pr"))).filter((x) => x > 0);
      return nz.length ? money2(nz.reduce((a, b) => a + b, 0) / nz.length) : "";
    };

    type Def = {
      key: string; label: string; measure: Measure; hint?: string;
      text: (row: GridRow, months: number[], month?: number) => string;
    };
    const defs: Def[] = [];
    if (shown.has("pr")) {
      defs.push({
        key: "pr", label: t("secPrice"), measure: "pr",
        text: (row, months, month) => {
          const g = gdOf(row);
          if (g && isLeafProd(row.prod)) {
            const ls = g.lines.filter((x) => x.productId === row.prod && months.includes(x.month));
            const vol = ls.reduce((a, x) => a + x.volume, 0);
            if (ls.length === 0) return "";
            return money2(vol > 0 ? ls.reduce((a, x) => a + x.unitPrice * x.volume, 0) / vol : ls.reduce((a, x) => a + x.unitPrice, 0) / ls.length);
          }
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
          return qty.format(sum(months, (m) => agg(row)?.[m]?.volume ?? 0));
        },
      });
    }
    if (shown.has("gross")) {
      defs.push({
        key: "gross", label: t("kpiGross"), measure: "gross", hint: t("calcGross"),
        text: (row, months) => money2(sum(months, (m) => toDisplay(agg(row)?.[m]?.gross ?? 0, m))),
      });
    }
    if (shown.has("ded")) {
      const labelsList = Array.from(new Set(p.deductions.map((d) => d.label)));
      for (const lb of labelsList) {
        const pct = (pid: string) => p.deductions.filter((d) => d.productId === pid && d.label === lb).reduce((s, d) => s + d.pct, 0);
        defs.push({
          key: `ded:${lb}`, label: lb, measure: "ded", hint: t("calcDeduction"),
          text: (row, months) => {
            const g = gdOf(row);
            const bp = g ? g.byProduct : byProduct;
            const ids = leavesUnder.get(g ? row.prod ?? TOTAL_KEY : row.key) ?? [];
            return money2(sum(months, (m) => ids.reduce((s, pid) => s + toDisplay(((bp[pid]?.[m]?.gross ?? 0) * pct(pid)) / 100, m), 0)));
          },
        });
      }
    }
    if (shown.has("net")) {
      defs.push({
        key: "net", label: t("kpiNet"), measure: "net", hint: t("calcNet"),
        text: (row, months) => money2(sum(months, (m) => toDisplay(agg(row)?.[m]?.net ?? 0, m))),
      });
    }

    const cols: GridCol[] = [];
    for (const d of defs) {
      for (const pd of periods) {
        cols.push({
          key: `${d.key}:${pd.label}`, groupKey: d.key, groupLabel: d.label, groupHint: d.hint, calc: !!d.hint, label: pd.label,
          editable: pd.month && (d.measure === "pr" || d.measure === "v") ? { field: d.measure === "pr" ? "pr" : "v", month: pd.month } : undefined,
          cell: (row) => d.text(row, pd.months, pd.month),
        });
      }
      cols.push({
        key: `${d.key}:total`, groupKey: d.key, groupLabel: d.label, groupHint: d.hint, calc: !!d.hint, label: t("total"), isTotal: true,
        cell: (row) => d.text(row, MONTHS),
      });
    }
    return cols;
  };
  const colDeps = [grouped, aggregated, totals, byProduct, leavesUnder, edits, baseLines, p.deductions, p.displayCurrency, p.rates, money, qty];
  // Lançamento: só preço e volume por mês. Análise: tudo, com período à escolha.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entryCols = useMemo(() => makeCols(new Set<Measure>(["pr", "v"]), "month"), colDeps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const analysisCols = useMemo(() => makeCols(shown, period), [shown, period, ...colDeps]);

  // Tela cheia (API nativa do navegador) para a área de lançamento.
  const fullRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === fullRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void fullRef.current?.requestFullscreen?.();
  }

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
      const r = await saveRevenueEntries({ orcamentoId: p.orcamentoId, entityNodeId: entityKey, extraDimensions: extraKey, currencyByProduct, cells });
      if (r.error) return setError(r.error);
      setEdits({});
      setCurrencyEdits({});
      setSaved(true);
      router.refresh();
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "params", label: t("tabParams") },
    { id: "assumptions", label: t("tabAssumptions") },
    { id: "entry", label: t("tabEntry") },
    { id: "analysis", label: t("tabAnalysis") },
  ];
  const sliceBar = (withCarried: boolean) => (
    <div className="rec-slice">
      {carried.length > 0 && (
        <div className="rec-slice-row rec-slice-row--end">
          <span className="rec-slice-lbl">{readOnly ? t("viewing") : t("launchingIn")}</span>
          {order.map((id) => (
            <div
              key={id}
              className={`rec-slice-dim${dragId === id ? " is-drag" : ""}`}
              onDragOver={(e) => { if (dragId && dragId !== id) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, id); setDragId(null); }}
            >
              <span
                className="rec-slice-grip"
                draggable
                title={t("dragToReorder")}
                onDragStart={(e) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; const box = (e.currentTarget as HTMLElement).closest(".rec-slice-dim"); if (box) e.dataTransfer.setDragImage(box, 20, 20); }}
                onDragEnd={() => setDragId(null)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="9" cy="6" r="1.8" /><circle cx="15" cy="6" r="1.8" /><circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" /><circle cx="9" cy="18" r="1.8" /><circle cx="15" cy="18" r="1.8" /></svg>
                {p.dimensions.find((d) => d.id === id)?.name}
              </span>
              <TreeSelect
                nodes={(p.dimNodes[id] ?? []).map((n) => ({ id: n.id, name: n.name, parentId: n.parentId }))}
                value={sel[id]}
                onChange={(v) => setSel(id, v)}
                allLabel={t("allItems")}
                disabled={dirty}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const monthLabels = monthLabelsAll;
  const grand = sumMonths(totals);

  return (
    <div ref={fullRef} className={`rec-wrap rec-full${isFull ? " is-full" : ""}`}>
      <div className="rec-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "active" : ""} onClick={() => setTab(x.id)}>
            <TabIcon id={x.id} />
            {x.label}
          </button>
        ))}
      </div>

      {error && <div className="rec-error">{error}</div>}

      {tab === "params" && (
        <>
          <div className="rec-metrics rec-subtabs">
            {([["deductions", t("tabDeductions")], ["products", t("paramProducts")]] as [ParamTab, string][]).map(([k, label]) => (
              <button key={k} className={paramTab === k ? "active" : ""} onClick={() => setParamTab(k)}>
                <ParamIcon id={k} />
                {label}
              </button>
            ))}
          </div>
          {paramTab === "products" && (
            <ProdutosPanel
              orcamentoId={p.orcamentoId}
              productTypeId={p.productTypeId}
              year={p.year}
              products={p.products}
              deductions={p.deductions}
              deductionLabels={p.deductionLabels ?? []}
              deductionDefaults={p.deductionDefaults ?? []}
              initialPrefs={p.productPrefs}
              onChanged={() => router.refresh()}
              onError={setError}
            />
          )}
          {paramTab === "deductions" && (
            <DeductionDefaultsPanel orcamentoId={p.orcamentoId} defaults={p.deductionDefaults ?? []} rules={p.deductionRules ?? []} groups={p.ruleGroups} products={p.products} onError={setError} />
          )}
        </>
      )}

      {tab === "assumptions" && (
        <PremissasPanel orcamentoId={p.orcamentoId} premises={p.premises ?? []} budgets={p.budgetOptions ?? []} products={p.products} groups={p.ruleGroups} carriedIds={carried} onError={setError} />
      )}

      {tab === "entry" && (
        <>
          {sliceBar(true)}
          <div className="rec-entry-bar">
            <span>{readOnly ? t("consolidatedHint") : ""}</span>
            <div>
              <Button variant="ghost" size="sm" onClick={toggleFull}>{isFull ? t("exitFullscreen") : t("fullscreen")}</Button>
              {dirty && <Button variant="ghost" size="sm" onClick={() => { setEdits({}); setCurrencyEdits({}); }}>{t("discard")}</Button>}
              <Button variant="primary" size="sm" onClick={save} disabled={!dirty || readOnly} isLoading={pending} loadingText={t("saving")}>
                {t("save")}
              </Button>
              {saved && !dirty && <span className="rec-saved">{t("saved")}</span>}
            </div>
          </div>
          <ReceitaGrid
            rows={unifiedRows}
            cols={entryCols}
            readOnly={readOnly}
            labels={{ item: t("productService"), currency: t("currency") }}
            onApply={applyChanges}
          />
        </>
      )}

      {tab === "analysis" && (
        <>
          {sliceBar(false)}
          <div className="rec-filters">
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
          <div className="rec-entry-bar">
            <span>{t("analysisHint")}</span>
            <div>
              <Button variant="ghost" size="sm" onClick={toggleFull}>{isFull ? t("exitFullscreen") : t("fullscreen")}</Button>
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
          {shown.has("ded") && !hasDeductions && <p className="rec-hint">{t("noDeductionsHint")}</p>}
          <ReceitaGrid
            rows={unifiedRows}
            cols={analysisCols}
            readOnly
            showCurrency={false}
            labels={{ item: t("productService"), currency: t("currency") }}
            onApply={() => {}}
          />
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
    </div>
  );
}

/** Ícones das abas do módulo (traço simples, herdam a cor do texto). */
function TabIcon({ id }: { id: Tab }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "params": // percentual (deduções)
      return (<svg {...common}><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></svg>);
    case "assumptions": // controles deslizantes
      return (<svg {...common}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>);
    case "entry": // tabela / lançamento
      return (<svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>);
    default: // gráfico
      return (<svg {...common}><path d="M4 20V4M4 20h16" /><path d="m8 15 4-4 3 3 5-6" /></svg>);
  }
}

function ParamIcon({ id }: { id: ParamTab }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "products": // caixa
      return (<svg {...common}><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>);
    case "deductions": // percentual
      return (<svg {...common}><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></svg>);
    default: // câmbio
      return (<svg {...common}><path d="M4 8h14l-4-4M20 16H6l4 4" /></svg>);
  }
}

function treeLabelsOf(t: ReturnType<typeof useTranslations>): TreeMultiSelectLabels {
  return {
    all: t("ruleAllStructures"),
    search: t("treeSearch"),
    synthetic: t("treeSynthetic"),
    analytic: t("treeAnalytic"),
    selectAll: t("treeAll"),
    clear: t("treeClear"),
    noResults: t("treeNoResults"),
    expandAll: t("treeExpand"),
    collapseAll: t("treeCollapse"),
    selected: (count) => t("treeSelected", { count }),
  };
}

const PRESETS = ["ICMS", "PIS", "COFINS", "ISS", "IPI"];

type RuleDraft = { entityIds: string[]; productIds: string[]; pct: string };
/** Regras equivalentes viram uma linha só com multi-seleção (estruturas e produtos/famílias). */
function groupRules(rs: DeductionRule[]): RuleDraft[] {
  // 1) mesmo produto + % → junta as estruturas
  const step1 = new Map<string, { productId: string; pct: number; entityIds: string[] }>();
  for (const r of rs) {
    const key = `${r.productId ?? ""}|${r.pct}`;
    const cur = step1.get(key) ?? { productId: r.productId ?? "", pct: r.pct, entityIds: [] };
    cur.entityIds.push(r.entityId ?? "");
    step1.set(key, cur);
  }
  // 2) mesmas estruturas + % → junta os produtos
  const step2 = new Map<string, RuleDraft>();
  for (const g of Array.from(step1.values())) {
    const ents = Array.from(new Set(g.entityIds)).sort();
    const key = `${ents.join(",")}|${g.pct}`;
    const cur = step2.get(key) ?? { entityIds: ents.filter(Boolean), productIds: [], pct: fmtInput(g.pct) };
    if (g.productId) cur.productIds.push(g.productId);
    step2.set(key, cur);
  }
  return Array.from(step2.values());
}
type DedDraftRow = { label: string; pct: string; rules: RuleDraft[] };

/** Deduções padrão da empresa e suas condições especiais por estrutura / produto. */
function DeductionDefaultsPanel({ orcamentoId, defaults, rules, groups, products, onError }: {
  orcamentoId: string;
  defaults: { label: string; pct: number }[];
  rules: DeductionRule[];
  groups: TreeSelectGroup[];
  products: ProductRow[];
  onError: (s: string | null) => void;
}) {
  const t = useTranslations("receita");
  const router = useRouter();
  const [items, setItems] = useState<DedDraftRow[]>(() =>
    defaults.map((d) => ({
      label: d.label,
      pct: fmtInput(d.pct),
      rules: groupRules(rules.filter((r) => r.label.toLowerCase() === d.label.toLowerCase())),
    })),
  );
  const [pending, start] = useTransition();
  const touch = (fn: (s: DedDraftRow[]) => DedDraftRow[]) => setItems(fn);
  const listRef = useRef<HTMLDivElement>(null);
  const [focusRow, setFocusRow] = useState<{ i: number; field: 0 | 1 } | null>(null);
  const [focusRule, setFocusRule] = useState<{ i: number; j: number } | null>(null);
  useEffect(() => {
    if (!focusRow) return;
    const el = listRef.current?.querySelectorAll(".rec-ded-row")[focusRow.i]?.querySelectorAll<HTMLInputElement>("input")[focusRow.field];
    el?.focus();
    el?.select();
    setFocusRow(null);
  }, [focusRow]);
  useEffect(() => {
    if (!focusRule) return;
    const el = listRef.current?.querySelectorAll(".rec-ded-block")[focusRule.i]?.querySelectorAll(".rec-rule-row")[focusRule.j]?.querySelector<HTMLElement>(".tms-trigger");
    el?.focus();
    setFocusRule(null);
  }, [focusRule]);
  const addRow = (label: string, field: 0 | 1) => { setFocusRow({ i: items.length, field }); touch((s) => [...s, { label, pct: "", rules: [] }]); };
  const [ruleIdx, setRuleIdx] = useState<number | null>(null);
  const cur = ruleIdx !== null ? items[ruleIdx] : null;
  const openRules = (i: number) => {
    setRuleIdx(i);
    if (items[i].rules.length === 0) touch((s) => s.map((x, k) => (k === i ? { ...x, rules: [{ entityIds: [], productIds: [], pct: "" }] } : x)));
  };
  // Ao fechar, descarta condições totalmente vazias (sem estrutura, produto nem %).
  const closeRules = () => {
    const i = ruleIdx;
    setRuleIdx(null);
    if (i === null) return;
    touch((s) => s.map((x, k) => (k === i ? { ...x, rules: x.rules.filter((r) => r.entityIds.length > 0 || r.productIds.length > 0 || r.pct) } : x)));
  };
  const addRule = (i: number) => {
    setFocusRule({ i, j: items[i].rules.length });
    touch((s) => s.map((x, k) => (k === i ? { ...x, rules: [...x.rules, { entityIds: [], productIds: [], pct: "" }] } : x)));
  };
  const patchRule = (i: number, j: number, patch: Partial<RuleDraft>) =>
    touch((s) => s.map((x, k) => (k === i ? { ...x, rules: x.rules.map((r, m) => (m === j ? { ...r, ...patch } : r)) } : x)));
  const ruleTitle = (n: number) => `${t("ruleButton")}${n > 0 ? ` (${n})` : ""}`;
  const indent = (d?: number) => "\u00A0\u00A0".repeat(d ?? 0);
  const productGroups: TreeSelectGroup[] = useMemo(
    () => [{ typeId: "produtos", name: t("ruleColProduct"), items: products.map((x) => ({ id: x.id, name: x.name, parentId: x.parentId })) }],
    [products, t],
  );
  const treeLabels = treeLabelsOf(t);
  return (
    <div className="rec-panel" ref={listRef}>
      <p className="rec-hint">{t("dedDefaultsHint")}</p>
      {items.map((it, i) => (
        <div className="rec-ded-block" key={i}>
          <div className="rec-ded-row">
            <button type="button" className={`rec-rule-btn${it.rules.length > 0 ? " is-set" : ""}`} onClick={() => openRules(i)} disabled={!it.label.trim()} title={ruleTitle(it.rules.length)} aria-label={ruleTitle(it.rules.length)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
            </button>
            <input value={it.label} onChange={(e) => touch((s) => s.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={t("deductionName")} />
            <input inputMode="decimal" value={it.pct} onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && touch((s) => s.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} placeholder="%" />
            <span>%</span>
            <button type="button" className="rec-edit-x" aria-label={t("remove")} title={t("remove")} onClick={() => touch((s) => s.filter((_, j) => j !== i))}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" /></svg>
            </button>
          </div>
        </div>
      ))}
      {ruleIdx !== null && cur && (
        <Modal
          open
          onClose={closeRules}
          title={`${t("ruleModalTitle")} · ${cur.label}`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="primary" size="sm" onClick={closeRules}>{t("ruleDone")}</Button>
            </div>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Button variant="accent-blue" size="sm" className="px-3" onClick={() => addRule(ruleIdx)}>+ {t("ruleAdd")}</Button>
          </div>
          <p className="rec-hint">{t("ruleModalHint", { pct: cur.pct || "0" })}</p>
          {cur.rules.length === 0 ? (
            <p className="rec-hint">{t("ruleEmpty")}</p>
          ) : (
            <div className="rec-rules rec-rules--modal">

              <div className="rec-rule-row rec-rule-head"><span>{t("ruleColStructure")}</span><span>{t("ruleColProduct")}</span><span>{t("dedColPct")}</span><span /></div>
              {cur.rules.map((r, j) => (
                <div className="rec-rule-row" key={j}>
                  <TreeMultiSelect groups={groups} value={r.entityIds} onChange={(ids) => patchRule(ruleIdx, j, { entityIds: ids })} labels={treeLabels} ariaLabel={t("ruleColStructure")} />
                  <TreeMultiSelect groups={productGroups} value={r.productIds} onChange={(ids) => patchRule(ruleIdx, j, { productIds: ids })} labels={{ ...treeLabels, all: t("ruleAllProducts") }} ariaLabel={t("ruleColProduct")} />
                  <span className="rec-edit-pct">
                    <input inputMode="decimal" value={r.pct} placeholder="0" aria-label={t("dedColPct")} onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && patchRule(ruleIdx, j, { pct: e.target.value })} />
                    %
                  </span>
                  <button type="button" className="rec-edit-x" aria-label={t("remove")} title={t("remove")} onClick={() => touch((s) => s.map((x, k) => (k === ruleIdx ? { ...x, rules: x.rules.filter((_, m) => m !== j) } : x)))}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" /></svg>
                  </button>
                </div>
              ))}
                        </div>
          )}
          <div style={{ minHeight: 300 }} />
        </Modal>
      )}
      <div className="rec-presets">
        {PRESETS.filter((x) => !items.some((i) => i.label.toLowerCase() === x.toLowerCase())).map((x) => (
          <button type="button" key={x} className="rec-chip" onClick={() => addRow(x, 1)}>+ {x}</button>
        ))}
        <button type="button" className="rec-chip" onClick={() => addRow("", 0)}>+ {t("other")}</button>
      </div>
      <div className="rec-actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button
          variant="primary" size="sm" isLoading={pending} loadingText={t("saving")}
          onClick={() => start(async () => {
            onError(null);
            const r = await saveDeductionDefaults({ orcamentoId, items: items.map((i) => ({ label: i.label, pct: num(i.pct) })) });
            if (r.error) { onError(r.error); return; }
            const flat = items.flatMap((i) =>
              i.rules.flatMap((x) =>
                (x.entityIds.length ? x.entityIds : [null]).flatMap((eid) =>
                  (x.productIds.length ? x.productIds : [null]).map((pid) => ({ label: i.label, entityId: eid, productId: pid, pct: num(x.pct) })),
                ),
              ),
            );
            const r2 = await saveDeductionRules({ orcamentoId, items: flat });
            if (r2.error) onError(r2.error); else router.refresh();
          })}
        >{t("save")}</Button>
      </div>
    </div>
  );
}

type PremiseDraft = {
  id: string | null;
  kind: "volume_growth" | "price_adjust";
  pct: string;
  fromMonth: number;
  base: PremiseRow["base"]; baseOrcamentoId: string | null;
  productIds: string[];
  dimensionFilters: Record<string, string[]>;
};
const EMPTY_PREMISE: PremiseDraft = { id: null, kind: "volume_growth", pct: "", fromMonth: 1, base: "entered", baseOrcamentoId: null, productIds: [], dimensionFilters: {} };

/** Premissas guardadas: lista + modal com recorte por produto/família e por dimensão (canal, unidade...). */
function PremissasPanel({ orcamentoId, premises, budgets, products, groups, carriedIds, onError }: {
  orcamentoId: string; premises: PremiseRow[]; budgets: { id: string; label: string; year: number }[]; products: ProductRow[]; groups: TreeSelectGroup[]; carriedIds: string[]; onError: (s: string | null) => void;
}) {
  const t = useTranslations("receita");
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<PremiseDraft | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);
  const [deleting, setDeleting] = useState<PremiseRow | null>(null);
  const [pending, start] = useTransition();
  const treeLabels = treeLabelsOf(t);
  const monthName = (m: number) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, m - 1, 1));
  const productGroups: TreeSelectGroup[] = useMemo(
    () => [{ typeId: "produtos", name: t("scopeProducts"), items: products.filter((x) => x.depth > 0).map((x) => ({ id: x.id, name: x.name, parentId: x.parentId === products.find((r) => r.depth === 0)?.id ? null : x.parentId })) }],
    [products, t],
  );
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of products) m.set(x.id, x.name);
    for (const g of groups) for (const it of g.items) m.set(it.id, it.name);
    return m;
  }, [products, groups]);
  const typeName = (id: string) => groups.find((g) => g.typeId === id)?.name ?? "";
  const summaryNames = (d: PremiseDraft) => {
    const parts = [
      ...d.productIds.map((id) => nameOf.get(id)),
      ...Object.values(d.dimensionFilters).flat().map((id) => nameOf.get(id)),
    ].filter((x): x is string => !!x);
    return parts.length > 0 ? parts.join(", ") : t("premAll");
  };
  const pctNum = (d: PremiseDraft) => parseFloat(d.pct.replace(",", "."));
  const kindText = (k: PremiseRow["kind"]) => (k === "volume_growth" ? t("kindVolume") : t("kindPrice"));
  const pctText = (r: PremiseRow) => `${r.pct > 0 ? "+" : ""}${String(r.pct).replace(".", ",")}% ${r.kind === "volume_growth" ? (r.base === "other_budget" ? t("unitOverBase") : t("unitMonth")) : t("unitOnce")}`;
  const baseText = (r: PremiseRow) => (r.kind === "price_adjust" ? t("basePrice") : r.base === "previous_month" ? t("basePrevious") : r.base === "other_budget" ? budgetName(r.baseOrcamentoId) : t("baseEntered"));
  const budgetName = (id: string | null) => { const b = budgets.find((x) => x.id === id); return b ? `${b.label} (${b.year})` : t("baseOtherBudget"); };

  function open(r?: PremiseRow) {
    onError(null);
    setDraft(r ? { id: r.id, kind: r.kind, pct: String(r.pct).replace(".", ","), fromMonth: r.fromMonth, base: r.base, baseOrcamentoId: r.baseOrcamentoId, productIds: r.productIds, dimensionFilters: r.dimensionFilters } : EMPTY_PREMISE);
  }
  function save() {
    if (!draft) return;
    onError(null);
    start(async () => {
      const r = await savePremise({ orcamentoId, id: draft.id, kind: draft.kind, pct: pctNum(draft), fromMonth: draft.fromMonth, base: draft.base, baseOrcamentoId: draft.baseOrcamentoId, productIds: draft.productIds, dimensionFilters: draft.dimensionFilters });
      if (r.error) { onError(r.error); return; }
      setDraft(null);
      router.refresh();
    });
  }
  function toggle(r: PremiseRow) {
    onError(null);
    start(async () => {
      const x = await setPremiseActive({ orcamentoId, id: r.id, active: !r.isActive });
      if (x.error) onError(x.error); else router.refresh();
    });
  }
  function confirmDelete() {
    const r = deleting;
    if (!r) return;
    start(async () => {
      const x = await deletePremise({ orcamentoId, id: r.id });
      setDeleting(null);
      if (x.error) onError(x.error); else router.refresh();
    });
  }
  const chips = (r: PremiseRow) => {
    const out: { key: string; text: string; dim: boolean }[] = [];
    for (const id of r.productIds) out.push({ key: `p${id}`, text: nameOf.get(id) ?? "?", dim: false });
    for (const [tid, ids] of Object.entries(r.dimensionFilters)) for (const id of ids) out.push({ key: `${tid}${id}`, text: nameOf.get(id) ?? "?", dim: true });
    return out;
  };
  const otherDim = (r: PremiseRow) => Object.keys(r.dimensionFilters).some((k) => !carriedIds.includes(k));

  return (
    <div className="rec-panel">
      <div className="rec-prem-head">
        <Button variant="accent-blue" size="sm" className="px-3" onClick={() => open()}>+ {t("premNew")}</Button>
      </div>

      {premises.length === 0 ? null : (
        <div className="rec-prem-table">
          <div className="rec-prem-row rec-prem-headrow">
            <span>{t("colPremise")}</span><span>{t("colBase")}</span><span>{t("colScope")}</span><span>{t("colFrom")}</span><span>{t("colActive")}</span><span />
          </div>
          {premises.map((r) => (
            <div key={r.id} className={`rec-prem-row${r.isActive ? "" : " is-off"}`}>
              <span><strong>{kindText(r.kind)}</strong><br /><small>{pctText(r)}</small></span>
              <span>{baseText(r)}</span>
              <span className="rec-prem-chips">
                {chips(r).length === 0 ? <span className="rec-chip-all">{t("premAll")}</span> : chips(r).map((c) => (
                  <span key={c.key} className={c.dim ? "rec-pchip rec-pchip--dim" : "rec-pchip"}>{c.text}</span>
                ))}
                {otherDim(r) && <small title={t("premOtherDimHint")}>⚠</small>}
              </span>
              <span>{monthName(r.fromMonth)}</span>
              <span>
                <button type="button" role="switch" aria-checked={r.isActive} aria-label={t("colActive")} className={`rec-switch${r.isActive ? " on" : ""}`} onClick={() => toggle(r)} disabled={pending}><span /></button>
              </span>
              <span className="rec-prem-actions">
                <button type="button" className="rec-link-btn" onClick={() => open(r)}>{t("premEditShort")}</button>
                <button type="button" className="rec-edit-x" aria-label={t("remove")} title={t("remove")} onClick={() => setDeleting(r)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" /></svg>
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="rec-prem-card">
          <div className="rec-prem-card-head">
            <strong>{draft.id ? t("premEdit") : t("premNew")}</strong>
          </div>
          <div className="rec-prem-form">
            <div className="rec-prem-type">
              <div className="rec-field">{t("premType")}
                <div className="rec-seg" data-on={draft.kind === "volume_growth" ? "produto" : "servico"} role="group" aria-label={t("premType")}>
                  <span className="rec-seg-thumb" aria-hidden />
                  <button type="button" className={draft.kind === "volume_growth" ? "on" : ""} onClick={() => setDraft({ ...draft, kind: "volume_growth" })}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m3 17 6-6 4 4 8-8M15 7h6v6" /></svg>{t("kindVolume")}</button>
                  <button type="button" className={draft.kind === "price_adjust" ? "on" : ""} onClick={() => setDraft({ ...draft, kind: "price_adjust" })}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>{t("kindPrice")}</button>
                </div>
              </div>
            </div>
            <div className="rec-prem-grid">
              <label className="rec-field">{t("premPct")} ({draft.kind === "volume_growth" ? (draft.base === "other_budget" ? t("unitOverBase") : t("unitMonth")) : t("unitOnce")})
                <input inputMode="decimal" value={draft.pct} autoFocus placeholder="0,0" onChange={(e) => /^-?\d*[.,]?\d*$/.test(e.target.value) && setDraft({ ...draft, pct: e.target.value })} />
              </label>
              <label className="rec-field">{t("colFrom")}
                <select value={draft.fromMonth} onChange={(e) => setDraft({ ...draft, fromMonth: Number(e.target.value) })}>
                  {MONTHS.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
                </select>
              </label>
              {draft.kind === "volume_growth" && (
                <label className="rec-field">{t("premBase")}
                  <select value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value as PremiseDraft["base"], baseOrcamentoId: e.target.value === "other_budget" ? draft.baseOrcamentoId : null })}>
                    <option value="entered">{t("baseEntered")}</option>
                    <option value="previous_month">{t("basePrevious")}</option>
                    <option value="other_budget">{t("baseOtherBudget")}</option>
                  </select>
                </label>
              )}
              {draft.kind === "volume_growth" && draft.base === "other_budget" && (
                <label className="rec-field">{t("premBaseBudget")}
                  <select value={draft.baseOrcamentoId ?? ""} onChange={(e) => setDraft({ ...draft, baseOrcamentoId: e.target.value || null })}>
                    <option value="">{t("premBaseBudgetPick")}</option>
                    {budgets.map((b) => <option key={b.id} value={b.id}>{b.label} ({b.year})</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="rec-prem-scope-head">
              <strong>{t("colScope")}</strong>
              <span>{t("premScopeHint")}</span>
            </div>
            <div className="rec-prem-grid rec-prem-grid--scope">
              <div className="rec-field">{t("scopeProducts")}
                <TreeMultiSelect groups={productGroups} value={draft.productIds} onChange={(ids) => setDraft({ ...draft, productIds: ids })} labels={{ ...treeLabels, all: t("allProducts") }} ariaLabel={t("scopeProducts")} />
              </div>
              {groups.filter((g) => carriedIds.includes(g.typeId) || (draft.dimensionFilters[g.typeId]?.length ?? 0) > 0 || moreFilters).map((g) => (
                <div className="rec-field" key={g.typeId}>{g.name}
                  <TreeMultiSelect
                    groups={[g]}
                    value={draft.dimensionFilters[g.typeId] ?? []}
                    onChange={(ids) => setDraft({ ...draft, dimensionFilters: { ...draft.dimensionFilters, [g.typeId]: ids } })}
                    labels={{ ...treeLabels, all: t("premAll") }}
                    ariaLabel={g.name}
                  />
                </div>
              ))}
            </div>
            {groups.some((g) => !carriedIds.includes(g.typeId) && !(draft.dimensionFilters[g.typeId]?.length ?? 0)) && (
              <button type="button" className="rec-link-btn rec-prem-more" onClick={() => setMoreFilters((v) => !v)}>
                {moreFilters ? t("premFewerFilters") : t("premMoreFilters")}
              </button>
            )}
            <p className="rec-prem-summary">
              {t("premSummary", {
                kind: kindText(draft.kind),
                pct: draft.pct || "0",
                unit: draft.kind === "volume_growth" ? (draft.base === "other_budget" ? t("unitOverBase") : t("unitMonth")) : t("unitOnce"),
                month: monthName(draft.fromMonth),
                scope: summaryNames(draft),
              })}
            </p>
            {Object.keys(draft.dimensionFilters).some((k) => (draft.dimensionFilters[k]?.length ?? 0) > 0 && !carriedIds.includes(k)) && (
              <p className="rec-hint">{t("premOtherDimHint")} {Object.entries(draft.dimensionFilters).filter(([k, v]) => v.length > 0 && !carriedIds.includes(k)).map(([k]) => typeName(k)).join(", ")}.</p>
            )}
            
          </div>
          <div className="rec-prem-card-foot">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={pending}>{t("prodCancel")}</Button>
            <Button variant="primary" size="sm" isLoading={pending} loadingText={t("saving")} disabled={!Number.isFinite(pctNum(draft)) || (draft.kind === "volume_growth" && draft.base === "other_budget" && !draft.baseOrcamentoId)} onClick={save}>{t("premSave")}</Button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("premDeleteTitle")}
        body={deleting ? t("premDeleteBody", { name: kindText(deleting.kind), pct: pctText(deleting) }) : ""}
        cancelLabel={t("prodCancel")}
        confirmLabel={t("prodDelete")}
        loading={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
