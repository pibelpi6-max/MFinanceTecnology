"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { readWorkbook, sheetToMatrix } from "@/lib/import/parseFile";
import {
  cleanCode, codeKey, nameKey, prepareProducts,
  type ExistingProduct, type PreparedProduct, type ProductStatus,
} from "@/lib/receita/cleanProducts";
import { importProdutos } from "./_actions";
import type { ProductRow } from "./ReceitaClient";

interface Props {
  open: boolean;
  onClose: () => void;
  orcamentoId: string;
  productTypeId: string;
  products: ProductRow[];
  usedIds: Set<string>;
  onDone: (msg: string) => void;
}

const HEADER_RE = /c[oó]d|nome|produto|descri|grupo|categoria|família|familia/i;

/** Cola do Excel (tab), do CSV com ponto e vírgula, ou uma coluna só. */
function parsePaste(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes(";")) ? ";" : null;
  return lines.map((l) => (sep ? l.split(sep) : [l]));
}

export function ImportProdutosModal({ open, onClose, orcamentoId, productTypeId, products, usedIds, onDone }: Props) {
  const t = useTranslations("receita");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [paste, setPaste] = useState("");
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [hasHeader, setHasHeader] = useState(false);
  const [colName, setColName] = useState(0);
  const [colCode, setColCode] = useState(-1);
  const [colGroup, setColGroup] = useState(-1);
  const [titleCase, setTitleCase] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<"all" | ProductStatus>("all");
  const [error, setError] = useState<string | null>(null);

  const width = matrix.reduce((m, r) => Math.max(m, r.length), 0);
  const headers = useMemo(
    () => Array.from({ length: width }, (_, i) => (hasHeader ? (matrix[0]?.[i] || `${t("importColumn")} ${i + 1}`) : `${t("importColumn")} ${i + 1}`)),
    [matrix, hasHeader, width, t]
  );
  const dataRows = useMemo(() => (hasHeader ? matrix.slice(1) : matrix), [matrix, hasHeader]);

  function load(m: string[][]) {
    setMatrix(m);
    setOverrides({});
    setExcluded(new Set());
    setError(null);
    const first = m[0] ?? [];
    const header = first.length > 0 && first.every((c) => c !== "" && !/^\d+([.,]\d+)?$/.test(c)) && first.some((c) => HEADER_RE.test(c));
    setHasHeader(header);
    const cols = Math.max(...m.map((r) => r.length), 0);
    let name = 0, code = -1, group = -1;
    if (header) {
      first.forEach((c, i) => {
        if (/c[oó]d/i.test(c)) code = i;
        else if (/grupo|categoria|fam[ií]lia|linha/i.test(c)) group = i;
        else if (/nome|produto|descri/i.test(c) && name === 0 && i !== code) name = i;
      });
      if (code === name) code = -1;
      if (code === 0 && name === 0) name = cols > 1 ? 1 : 0;
    } else if (cols >= 2) {
      const avg = (i: number) => m.reduce((s, r) => s + (r[i]?.length ?? 0), 0) / Math.max(1, m.length);
      if (avg(0) < avg(1) && avg(0) <= 14) { code = 0; name = 1; }
    }
    setColName(name); setColCode(code); setColGroup(group);
  }

  async function onFile(file: File) {
    try {
      const wb = await readWorkbook(file);
      const m = sheetToMatrix(wb, wb.SheetNames[0]).filter((r) => r.some((c) => c.trim() !== ""));
      if (m.length === 0) throw new Error(t("importEmpty"));
      setFileName(file.name);
      setPaste("");
      load(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("importEmpty"));
    }
  }

  const existing: ExistingProduct[] = useMemo(
    () => products.map((r) => ({ id: r.id, code: r.code, name: r.name, isLeaf: r.isLeaf, depth: r.depth })),
    [products]
  );
  const prepared: PreparedProduct[] = useMemo(
    () =>
      prepareProducts(
        dataRows.map((r) => ({ name: r[colName] ?? "", code: colCode >= 0 ? r[colCode] ?? "" : "", group: colGroup >= 0 ? r[colGroup] ?? "" : "" })),
        // Tudo que já existe (menos a raiz) conta para duplicidade de nome e de código.
        existing.filter((e) => e.depth > 0),
        { titleCase, codeOverrides: overrides }
      ),
    [dataRows, colName, colCode, colGroup, existing, titleCase, overrides]
  );

  const counts = useMemo(() => {
    const c: Record<ProductStatus, number> = { new: 0, update: 0, exists: 0, "dup-file": 0, "dup-code": 0, empty: 0 };
    prepared.forEach((p) => { c[p.status]++; });
    return c;
  }, [prepared]);
  const actionable = (p: PreparedProduct) => (p.status === "new" || p.status === "update") && !excluded.has(p.index);
  const toApply = prepared.filter(actionable);
  const shown = prepared.filter((p) => filter === "all" || p.status === filter);

  const statusLabel: Record<ProductStatus, string> = {
    new: t("stNew"), update: t("stUpdate"), exists: t("stExists"), "dup-file": t("stDupFile"), "dup-code": t("stDupCode"), empty: t("stEmpty"),
  };

  function run() {
    setError(null);
    const root = products.find((r) => r.depth === 0);
    if (!root) { setError(t("importNoRoot")); return; }
    const groupRows = products.filter((r) => r.depth > 0 && (!r.isLeaf || !usedIds.has(r.id)));
    const takenCodes = new Set(products.map((r) => codeKey(r.code)));
    toApply.forEach((p) => p.code && takenCodes.add(codeKey(p.code)));
    let gn = 0;
    const nextGroupCode = () => { let c: string; do c = `G${String(++gn).padStart(3, "0")}`; while (takenCodes.has(c.toLowerCase())); takenCodes.add(c.toLowerCase()); return c; };
    const newGroups = new Map<string, { code: string; name: string }>();
    const creates = toApply.filter((p) => p.status === "new").map((p) => {
      let parentId: string | null = root.id;
      let parentLevel = 1;
      let groupCode: string | undefined;
      if (p.group) {
        const gk = nameKey(p.group);
        const ex = groupRows.find((g) => nameKey(g.name) === gk);
        if (ex) { parentId = ex.id; parentLevel = ex.depth + 1; }
        else {
          let g = newGroups.get(gk);
          if (!g) { g = { code: nextGroupCode(), name: p.group }; newGroups.set(gk, g); }
          groupCode = g.code; parentId = null;
        }
      }
      return { code: cleanCode(p.code), name: p.name, parentId, parentLevel, groupCode };
    });
    const updates = toApply.filter((p) => p.status === "update").map((p) => {
      const ex = products.find((r) => r.id === p.existingId)!;
      return { id: ex.id, versionId: ex.versionId, validFromYear: ex.validFromYear, name: p.name, parentId: ex.parentId };
    });
    start(async () => {
      const r = await importProdutos({
        orcamentoId, productTypeId, rootId: root.id, rootLevel: 1,
        groups: Array.from(newGroups.values()), creates, updates,
      });
      if (r.error) { setError(r.error); return; }
      onDone(t("importDone", { created: creates.length, updated: r.updated }));
    });
  }

  const hasData = dataRows.length > 0;
  const colOptions = (allowNone: boolean) => (
    <>
      {allowNone && <option value={-1}>{t("importNone")}</option>}
      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("importTitle")}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{t("prodCancel")}</Button>
          <Button variant="primary" onClick={run} disabled={!hasData || toApply.length === 0 || pending} isLoading={pending} loadingText={t("saving")}>
            {t("importRun", { count: toApply.length })}
          </Button>
        </>
      }
    >
      <div className="rec-imp">
        {!hasData && (
          <>
            <p className="rec-hint">{t("importIntro")}</p>
            <textarea
              rows={8}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={t("importPastePlaceholder")}
            />
            <div className="rec-imp-actions">
              <Button variant="primary" size="sm" onClick={() => { const m = parsePaste(paste); if (m.length) { setFileName(""); load(m); } }} disabled={!paste.trim()}>
                {t("importAnalyze")}
              </Button>
              <span>{t("importOr")}</span>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>{t("importChooseFile")}</Button>
            </div>
          </>
        )}

        {hasData && (
          <>
            <div className="rec-imp-cols">
              {fileName && <span className="rec-imp-file">{fileName}</span>}
              <label className="rec-imp-chk"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />{t("importHeader")}</label>
              <label>{t("importColName")}<select value={colName} onChange={(e) => setColName(Number(e.target.value))}>{colOptions(false)}</select></label>
              <label>{t("importColCode")}<select value={colCode} onChange={(e) => setColCode(Number(e.target.value))}>{colOptions(true)}</select></label>
              <label>{t("importColGroup")}<select value={colGroup} onChange={(e) => setColGroup(Number(e.target.value))}>{colOptions(true)}</select></label>
              <label className="rec-imp-chk"><input type="checkbox" checked={titleCase} onChange={(e) => setTitleCase(e.target.checked)} />{t("importTitleCase")}</label>
              <Button variant="ghost" size="sm" onClick={() => { setMatrix([]); setPaste(""); }}>{t("importStartOver")}</Button>
            </div>

            <div className="rec-imp-summary">
              {(["new", "update", "exists", "dup-file", "dup-code", "empty"] as ProductStatus[]).filter((s) => counts[s] > 0).map((s) => (
                <button key={s} className={`rec-imp-pill st-${s}${filter === s ? " on" : ""}`} onClick={() => setFilter(filter === s ? "all" : s)}>
                  {counts[s]} {statusLabel[s]}
                </button>
              ))}
            </div>

            <div className="rec-imp-table">
              <table>
                <thead><tr><th /><th>{t("importStatus")}</th><th>{t("importColName")}</th><th>{t("importColCode")}</th><th>{t("importColGroup")}</th></tr></thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.index} className={actionable(p) || excluded.has(p.index) ? "" : "is-skip"}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={p.status !== "new" && p.status !== "update"}
                          checked={actionable(p)}
                          onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(p.index)) n.delete(p.index); else n.add(p.index); return n; })}
                        />
                      </td>
                      <td><span className={`rec-imp-pill st-${p.status}`}>{statusLabel[p.status]}</span></td>
                      <td>
                        {p.name || <em>—</em>}
                        {p.adjusted && p.name && <small className="rec-imp-was" title={p.rawName}>{t("importWas")}: “{p.rawName}”</small>}
                      </td>
                      <td>
                        <input
                          value={p.code}
                          placeholder={p.status === "empty" ? "" : t("importCodePh")}
                          className={p.codeIsAuto ? "is-auto" : ""}
                          disabled={p.status === "empty" || p.status === "dup-file" || p.status === "exists"}
                          onChange={(e) => setOverrides((o) => ({ ...o, [p.index]: e.target.value }))}
                        />
                      </td>
                      <td>{p.group}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rec-hint">{t("importCodeHint")}</p>
          </>
        )}
        {error && <div className="rec-error">{error}</div>}
      </div>
    </Modal>
  );
}
