"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type { ColumnMeta, TablePrefs } from "@/components/ui/DataTable/types";
import { parseProductNames } from "@/lib/receita/parseProductNames";
import { codeKey } from "@/lib/receita/cleanProducts";
import { cancelDimensionNode, updateDimensionNode } from "../../../dimensoes/_actions";
import type { Deduction } from "@/lib/receita/calc";
import { importProdutos, saveDeductions, saveDeductionsBulk, setItemKind } from "./_actions";
import { ImportProdutosModal } from "./ImportProdutosModal";
import type { ProductRow } from "./ReceitaClient";

interface Props {
  orcamentoId: string;
  productTypeId: string;
  year: number;
  products: ProductRow[];
  deductions: Deduction[];
  /** Nomes de dedução já cadastrados na empresa; viram atalhos ao lado dos padrões. */
  deductionLabels: string[];
  deductionDefaults: { label: string; pct: number }[];
  initialPrefs?: TablePrefs;
  onChanged: () => void;
  onError: (s: string | null) => void;
  /** Cadastro geral (Parâmetros): sem a coluna e o editor de deduções, que são por orçamento. */
  hideDeductions?: boolean;
}

type Kind = "produto" | "servico";

const PRESETS = ["ICMS", "PIS", "COFINS", "ISS", "IPI"];
const parsePct = (s: string) => {
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const fmtPct = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
type DedDraft = { label: string; pct: string };

/**
 * Cadastro de produtos e serviços da Receita: incluir (vários de uma vez),
 * editar código/nome/tipo e excluir. A organização em grupos fica para a
 * ficha técnica (Custos); aqui os itens entram direto sob a raiz.
 */
export function ProdutosPanel({ orcamentoId, productTypeId, year, products, deductions, deductionLabels, deductionDefaults, initialPrefs, onChanged, onError, hideDeductions = false }: Props) {
  const t = useTranslations("receita");
  const [pending, start] = useTransition();
  const root = products.find((r) => r.depth === 0);

  const [text, setText] = useState("");
  const [newKind, setNewKind] = useState<Kind>("produto");
  const [family, setFamily] = useState("");
  const [editParent, setEditParent] = useState("");
  const families = products.filter((r) => !r.isLeaf && r.depth === 1);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editKind, setEditKind] = useState<Kind>("produto");
  const [editDeds, setEditDeds] = useState<DedDraft[]>([]);
  const dedsRef = useRef<HTMLDivElement>(null);
  const [focusDed, setFocusDed] = useState<{ i: number; field: "label" | "pct" } | null>(null);
  useEffect(() => {
    if (!focusDed) return;
    const row = dedsRef.current?.querySelectorAll(".rec-edit-row:not(.rec-edit-row-head)")[focusDed.i];
    const el = row?.querySelectorAll<HTMLInputElement>("input")[focusDed.field === "label" ? 0 : 1];
    el?.focus();
    el?.select();
    setFocusDed(null);
  }, [focusDed]);
  const addDed = (label: string, pct: string, field: "label" | "pct") => {
    setFocusDed({ i: editDeds.length, field });
    setEditDeds((d) => [...d, { label, pct }]);
  };
  const [copyTo, setCopyTo] = useState<Kind | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [switchTo, setSwitchTo] = useState<ProductRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);

  function nextCodes(n: number): string[] {
    const taken = new Set(products.map((r) => codeKey(r.code)));
    const nums = products.map((r) => /^P(\d+)$/i.exec(r.code)).filter(Boolean).map((m) => Number(m![1]));
    let cur = nums.length ? Math.max(...nums) : 0;
    return Array.from({ length: n }, () => {
      let c: string;
      do c = `P${String(++cur).padStart(3, "0")}`;
      while (taken.has(c.toLowerCase()));
      return c;
    });
  }

  function add() {
    const names = parseProductNames(text);
    if (names.length === 0 || !root) return;
    onError(null);
    setNotice(null);
    const codes = nextCodes(names.length);
    const famName = newKind === "servico" ? "" : family.trim();
    const existing = famName ? families.find((f) => f.name.toLowerCase() === famName.toLowerCase()) : undefined;
    let groups: { code: string; name: string }[] = [];
    let groupCode: string | undefined;
    if (famName && !existing) {
      const taken = new Set(products.map((r) => codeKey(r.code)));
      let n = 0;
      let fc: string;
      do fc = `F${String(++n).padStart(3, "0")}`;
      while (taken.has(fc.toLowerCase()));
      groupCode = fc;
      groups = [{ code: fc, name: famName }];
    }
    start(async () => {
      const r = await importProdutos({
        orcamentoId, productTypeId, rootId: root.id, rootLevel: 1, groups, updates: [],
        creates: names.map((name, i) => ({
          code: codes[i], name, kind: newKind,
          ...(groupCode
            ? { parentId: null, parentLevel: 2, groupCode }
            : existing
              ? { parentId: existing.id, parentLevel: existing.depth + 1 }
              : { parentId: root.id, parentLevel: 1 }),
        })),
      });
      if (r.error) { onError(r.error); return; }
      setText("");
      setFamily("");
      setAdding(false);
      onChanged();
    });
  }

  function startEdit(r: ProductRow) {
    setEditing(r);
    setEditName(r.name);
    setEditCode(r.code);
    setEditKind(r.kind);
    setEditParent(r.parentId ?? root?.id ?? "");
    setEditDeds(deductions.filter((d) => d.productId === r.id).map((d) => ({ label: d.label, pct: fmtPct(d.pct) })));
    setSnapshot(JSON.stringify([r.code, r.name, r.kind, r.parentId ?? root?.id ?? "", deductions.filter((d) => d.productId === r.id).map((d) => ({ label: d.label, pct: fmtPct(d.pct) }))]));
  }

  const dirty = editing !== null && JSON.stringify([editCode, editName, editKind, editParent, editDeds]) !== snapshot;

  function openOrClose(r: ProductRow) {
    if (editing && dirty) { setSwitchTo(r); return; }
    if (editing?.id === r.id) setEditing(null);
    else startEdit(r);
  }

  function confirmSwitch() {
    const target = switchTo;
    setSwitchTo(null);
    if (!target) return;
    if (editing?.id === target.id) setEditing(null);
    else startEdit(target);
  }

  const editor = (row: ProductRow) => {
    const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") saveEdit(row); if (e.key === "Escape") openOrClose(row); };
    const isItem = row.isLeaf && row.depth > 0;
    const total = editDeds.reduce((s, d) => s + parsePct(d.pct), 0);
    const known = deductionDefaults.map((d) => d.label);
    const base = known.length > 0 ? known : PRESETS;
    const presets = [...base, ...deductionLabels.filter((l) => !base.some((p) => p.toLowerCase() === l.toLowerCase()))]
      .filter((x) => !editDeds.some((d) => d.label.toLowerCase() === x.toLowerCase()));
    return (
      <div className={`rec-edit${hideDeductions ? " rec-edit--compact" : ""}`}>
        <div className="rec-edit-main">
          {isItem && (
            <div className="rec-edit-field">
              {t("kindLabel")}
              <div className="rec-seg" data-on={editKind} role="group" aria-label={t("kindLabel")}>
                <span className="rec-seg-thumb" aria-hidden />
                <button type="button" className={editKind === "produto" ? "on" : ""} onClick={() => setEditKind("produto")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>{t("kindProduct")}</button>
                <button type="button" className={editKind === "servico" ? "on" : ""} onClick={() => setEditKind("servico")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z" /></svg>{t("kindService")}</button>
              </div>
            </div>
          )}
          {isItem && root && editKind === "produto" && (
            <label className="rec-f-family">
              {t("familyLabel")}
              <select value={editParent} onChange={(e) => setEditParent(e.target.value)}>
                <option value={root.id}>{t("familyNone")}</option>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
          <label className="rec-f-code">
            {t("importColCode")}
            <input value={editCode} onChange={(e) => setEditCode(e.target.value)} onKeyDown={onKey} />
          </label>
          <label className="rec-f-name">
            {isItem && editKind === "servico" ? t("kindService") : t("product")}
            <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={onKey} />
          </label>
        </div>
        {isItem && !hideDeductions && (
          <div className="rec-edit-deds">
            <div className="rec-edit-deds-head">
              <strong>{t("dedSectionTitle")}</strong>
              <span>{t("totalDeductions")} <b>{fmtPct(total)}%</b></span>
            </div>
            {editDeds.length > 0 && (
              <div className="rec-edit-table" ref={dedsRef}>
                <div className="rec-edit-row rec-edit-row-head"><span>{t("dedColName")}</span><span>{t("dedColPct")}</span><span /></div>
                {editDeds.map((it, i) => (
                  <div className="rec-edit-row" key={i}>
                    <input value={it.label} placeholder={t("deductionName")} onChange={(e) => setEditDeds((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                    <span className="rec-edit-pct">
                      <input inputMode="decimal" value={it.pct} placeholder="0" onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && setEditDeds((x) => x.map((y, j) => (j === i ? { ...y, pct: e.target.value } : y)))} />
                      %
                    </span>
                    <button type="button" className="rec-edit-x" aria-label={t("remove")} title={t("remove")} onClick={() => setEditDeds((x) => x.filter((_, j) => j !== i))}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="rec-presets">
              <span className="rec-edit-hint">{t("dedAdd")}</span>
              {presets.map((x) => (
                <button type="button" key={x} className="rec-chip" onClick={() => addDed(x, defaultPct(x), "pct")}>+ {x}</button>
              ))}
              <button type="button" className="rec-chip rec-chip-new" onClick={() => addDed("", "", "label")}>+ {t("other")}</button>
            </div>
            <div className="rec-edit-apply">
              <span>{t("dedCopyTitle")}</span>
              <button type="button" className="rec-chip" disabled={pending || countOf("produto") === 0} onClick={() => setCopyTo("produto")}>{t("dedCopyProducts", { n: countOf("produto") })}</button>
              <button type="button" className="rec-chip" disabled={pending || countOf("servico") === 0} onClick={() => setCopyTo("servico")}>{t("dedCopyServices", { n: countOf("servico") })}</button>
            </div>
          </div>
        )}
        <div className="rec-edit-foot">
          <Button variant="ghost" size="sm" onClick={() => openOrClose(row)}>{t("prodCancel")}</Button>
          <Button variant="primary" size="sm" onClick={() => saveEdit(row)} disabled={pending || !editName.trim() || !editCode.trim()} isLoading={pending}>{t("save")}</Button>
        </div>
      </div>
    );
  };

  function saveEdit(row: ProductRow) {
    const name = editName.trim();
    const code = editCode.trim();
    if (!name || !code) return;
    onError(null);
    start(async () => {
      const r = await updateDimensionNode({
        nodeId: row.id, versionId: row.versionId, currentValidFromYear: row.validFromYear,
        name, code: code !== row.code ? code : undefined, parentNodeId: row.isLeaf && row.depth > 0 ? (editKind === "servico" ? (root?.id ?? row.parentId) : (editParent || row.parentId)) : row.parentId, year,
      });
      if (r.error) { onError(r.error); return; }
      if (editKind !== row.kind) {
        const k = await setItemKind({ orcamentoId, nodeId: row.id, kind: editKind });
        if (k.error) { onError(k.error); return; }
      }
      if (row.isLeaf && row.depth > 0 && !hideDeductions) {
        const items = editDeds.filter((d) => d.label.trim()).map((d) => ({ label: d.label.trim(), pct: parsePct(d.pct) }));
        const d = await saveDeductions({ orcamentoId, productId: row.id, items: items.map((i) => ({ code: i.label, ...i })) });
        if (d.error) { onError(d.error); return; }
      }
      setEditing(null);
      onChanged();
    });
  }

  const countOf = (k: Kind) => products.filter((x) => x.isLeaf && x.depth > 0 && x.kind === k).length;

  function confirmCopy() {
    const kind = copyTo;
    if (!kind) return;
    const ids = products.filter((x) => x.isLeaf && x.depth > 0 && x.kind === kind).map((x) => x.id);
    const items = editDeds.filter((d) => d.label.trim()).map((d) => ({ label: d.label.trim(), pct: parsePct(d.pct) }));
    onError(null);
    start(async () => {
      const r = await saveDeductionsBulk({ orcamentoId, productIds: ids, items });
      setCopyTo(null);
      if (r.error) { onError(r.error); return; }
      setNotice(t("dedCopyDone", { n: ids.length }));
      onChanged();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const row = deleting;
    onError(null);
    start(async () => {
      const r = await cancelDimensionNode({ versionId: row.versionId, year });
      setDeleting(null);
      if (r.error) { onError(r.error); return; }
      onChanged();
    });
  }

  const kindSelect = (value: Kind, onChange: (k: Kind) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as Kind)}>
      <option value="produto">{t("kindProduct")}</option>
      <option value="servico">{t("kindService")}</option>
    </select>
  );

  const depthById = new Map(products.map((r) => [r.id, r.depth]));
  const kindText = (r: ProductRow) => (r.depth === 0 || !r.isLeaf ? "" : r.kind === "servico" ? t("kindService") : t("kindProduct"));

  /** Percentual mais usado para um nome de dedução já cadastrado (vem preenchido ao adicionar o atalho). */
  const defaultPct = (label: string): string => {
    const preset = deductionDefaults.find((d) => d.label.toLowerCase() === label.toLowerCase());
    if (preset && preset.pct > 0) return fmtPct(preset.pct);
    const counts = new Map<number, number>();
    for (const d of deductions) {
      if (d.label.toLowerCase() === label.toLowerCase() && d.pct > 0) counts.set(d.pct, (counts.get(d.pct) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestN = 0;
    counts.forEach((n, pct) => { if (n > bestN) { best = pct; bestN = n; } });
    return best === null ? "" : fmtPct(best);
  };

  const dedsOf = (id: string) => deductions.filter((d) => d.productId === id);
  const dedText = (r: ProductRow) => {
    if (!r.isLeaf || r.depth === 0) return "";
    const ds = dedsOf(r.id);
    return ds.length === 0 ? "—" : `${fmtPct(ds.reduce((s, d) => s + d.pct, 0))}%`;
  };

  const columns: ColumnMeta<ProductRow>[] = [
    {
      key: "code", label: t("importColCode"), width: 110, getText: (r) => r.code, filterable: true,
      render: (r) => <code className="settings-code">{r.code}</code>,
    },
    {
      key: "name", label: t("product"), maxWidth: 420, getText: (r) => r.name, filterable: true,
      render: (r) => <span className={r.isLeaf ? "text-gray-800" : "font-semibold text-gray-900"}>{r.name}</span>,
    },
    {
      key: "kind", label: t("kindLabel"), width: 150, getText: kindText, filterable: true, noTooltip: true,
      render: (r) =>
        r.isLeaf && r.depth > 0 ? (
          <span className={`rec-kind-btn rec-kind-${r.kind}`}>
            <KindIcon kind={r.kind} />
            {r.kind === "servico" ? t("kindService") : t("kindProduct")}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </span>
        ) : null,
    },
    {
      key: "deductions", label: t("tabDeductions"), width: 200, align: "right", getText: dedText, filterable: false,
      render: (r) => {
        if (!r.isLeaf || r.depth === 0) return null;
        const ds = dedsOf(r.id);
        if (ds.length === 0) return <span className="text-gray-400">—</span>;
        return (
          <span title={ds.map((d) => `${d.label} ${fmtPct(d.pct)}%`).join(" · ")}>
            <strong>{dedText(r)}</strong> <span className="rec-ded-names">{ds.map((d) => d.label).join(", ")}</span>
          </span>
        );
      },
    },
  ];

  const visibleColumns = hideDeductions ? columns.filter((c) => c.key !== "deductions") : columns;

  return (
    <div className="rec-prod">
      {notice && <p className="rec-saved">{notice}</p>}

      <DataTable<ProductRow>
        items={products}
        columns={visibleColumns}
        prefsKey={hideDeductions ? "parametros_produtos_cols" : "receita_produtos_cols"}
        initialPrefs={initialPrefs}
        buildTree={(items) => items.map((item) => ({ item, depth: depthById.get(item.id) ?? 0 }))}
        isIndentedRow={(r) => r.depth > 0}
        onNew={() => setAdding(true)}
        newLabel={t("prodAddButton")}
        onImport={() => setImportOpen(true)}
        onEdit={openOrClose}
        onRowClick={openOrClose}
        expandedRowId={editing?.id ?? null}
        renderExpanded={editor}
        onDelete={(r) => setDeleting(r)}
        canDelete={(r) => r.isLeaf && r.depth > 0}
        editLabel={t("prodRename")}
        deleteLabel={t("prodDelete")}
        emptyMessage={t("noProducts")}
      />

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={t("prodAddLabel")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>{t("prodCancel")}</Button>
            <Button variant="primary" size="sm" onClick={add} disabled={pending || parseProductNames(text).length === 0} isLoading={pending}>
              {t("prodAddButton")}
            </Button>
          </>
        }
      >
        <div className="rec-prod-form">
          <label>
            {t("prodAddLabel")}
            <textarea rows={5} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("prodAddPlaceholder")} />
          </label>
          {newKind === "produto" && <label>
            {t("familyLabel")}
            <input list="rec-family-list" value={family} onChange={(e) => setFamily(e.target.value)} placeholder={t("familyPlaceholder")} />
            <datalist id="rec-family-list">{families.map((f) => <option key={f.id} value={f.name} />)}</datalist>
          </label>}
          <label>
            {t("kindLabel")}
            {kindSelect(newKind, setNewKind)}
          </label>
        </div>
      </Modal>

      {importOpen && (
        <ImportProdutosModal
          open
          onClose={() => setImportOpen(false)}
          orcamentoId={orcamentoId}
          productTypeId={productTypeId}
          products={products}
          onDone={(msg) => { setImportOpen(false); setNotice(msg); onChanged(); }}
        />
      )}

      <ConfirmModal
        open={copyTo !== null}
        onClose={() => setCopyTo(null)}
        title={t("dedCopyConfirmTitle")}
        body={copyTo ? t("dedCopyConfirmBody", { n: copyTo ? countOf(copyTo) : 0, kind: copyTo === "servico" ? t("kindService").toLowerCase() : t("kindProduct").toLowerCase() }) : ""}
        cancelLabel={t("prodCancel")}
        confirmLabel={t("dedCopyConfirm")}
        loading={pending}
        onConfirm={confirmCopy}
      />

      <ConfirmModal
        open={switchTo !== null}
        onClose={() => setSwitchTo(null)}
        title={t("editDiscardTitle")}
        body={t("editDiscardBody")}
        cancelLabel={t("editKeep")}
        confirmLabel={t("editDiscard")}
        onConfirm={confirmSwitch}
      />

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("prodDeleteTitle")}
        body={deleting && t.rich("prodDeleteBody", { name: deleting.name, b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong> })}
        cancelLabel={t("prodCancel")}
        confirmLabel={t("prodDelete")}
        loading={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/** Ícone do tipo do item: caixa (produto) ou chave (serviço). */
function KindIcon({ kind }: { kind: "produto" | "servico" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "produto" ? (
        <><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>
      ) : (
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z" />
      )}
    </svg>
  );
}
