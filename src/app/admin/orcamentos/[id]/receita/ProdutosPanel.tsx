"use client";

import { useState, useTransition } from "react";
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
  initialPrefs?: TablePrefs;
  onChanged: () => void;
  onError: (s: string | null) => void;
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
export function ProdutosPanel({ orcamentoId, productTypeId, year, products, deductions, initialPrefs, onChanged, onError }: Props) {
  const t = useTranslations("receita");
  const [pending, start] = useTransition();
  const root = products.find((r) => r.depth === 0);

  const [text, setText] = useState("");
  const [newKind, setNewKind] = useState<Kind>("produto");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editKind, setEditKind] = useState<Kind>("produto");
  const [editDeds, setEditDeds] = useState<DedDraft[]>([]);
  const [applyAll, setApplyAll] = useState(false);
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
    start(async () => {
      const r = await importProdutos({
        orcamentoId, productTypeId, rootId: root.id, rootLevel: 1, groups: [], updates: [],
        creates: names.map((name, i) => ({ code: codes[i], name, parentId: root.id, parentLevel: 1, kind: newKind })),
      });
      if (r.error) { onError(r.error); return; }
      setText("");
      setAdding(false);
      onChanged();
    });
  }

  function startEdit(r: ProductRow) {
    setEditing(r);
    setEditName(r.name);
    setEditCode(r.code);
    setEditKind(r.kind);
    setEditDeds(deductions.filter((d) => d.productId === r.id).map((d) => ({ label: d.label, pct: fmtPct(d.pct) })));
    setApplyAll(false);
  }

  function saveEdit(row: ProductRow) {
    const name = editName.trim();
    const code = editCode.trim();
    if (!name || !code) return;
    onError(null);
    start(async () => {
      const r = await updateDimensionNode({
        nodeId: row.id, versionId: row.versionId, currentValidFromYear: row.validFromYear,
        name, code: code !== row.code ? code : undefined, parentNodeId: row.parentId, year,
      });
      if (r.error) { onError(r.error); return; }
      if (editKind !== row.kind) {
        const k = await setItemKind({ orcamentoId, nodeId: row.id, kind: editKind });
        if (k.error) { onError(k.error); return; }
      }
      if (row.isLeaf && row.depth > 0) {
        const items = editDeds.filter((d) => d.label.trim()).map((d) => ({ label: d.label.trim(), pct: parsePct(d.pct) }));
        const leafIds = products.filter((x) => x.isLeaf && x.depth > 0).map((x) => x.id);
        const d = applyAll
          ? await saveDeductionsBulk({ orcamentoId, productIds: leafIds, items })
          : await saveDeductions({ orcamentoId, productId: row.id, items: items.map((i) => ({ code: i.label, ...i })) });
        if (d.error) { onError(d.error); return; }
      }
      setEditing(null);
      onChanged();
    });
  }

  function changeKind(row: ProductRow, kind: Kind) {
    if (kind === row.kind) return;
    onError(null);
    start(async () => {
      const k = await setItemKind({ orcamentoId, nodeId: row.id, kind });
      if (k.error) { onError(k.error); return; }
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
          <select
            className={`rec-kind rec-kind-select rec-kind-${r.kind}`}
            value={r.kind}
            disabled={pending}
            aria-label={t("kindLabel")}
            onChange={(e) => changeKind(r, e.target.value as Kind)}
          >
            <option value="produto">{t("kindProduct")}</option>
            <option value="servico">{t("kindService")}</option>
          </select>
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

  return (
    <div className="rec-prod">
      <p className="rec-hint">{t("prodHint")}</p>
      {notice && <p className="rec-saved">{notice}</p>}

      <DataTable<ProductRow>
        items={products}
        columns={columns}
        prefsKey="receita_produtos_cols"
        initialPrefs={initialPrefs}
        buildTree={(items) => items.map((item) => ({ item, depth: depthById.get(item.id) ?? 0 }))}
        isIndentedRow={(r) => r.depth > 0}
        onNew={() => setAdding(true)}
        newLabel={t("prodAddButton")}
        onImport={() => setImportOpen(true)}
        onEdit={startEdit}
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
          <label>
            {t("kindLabel")}
            {kindSelect(newKind, setNewKind)}
          </label>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t("prodRename")}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t("prodCancel")}</Button>
            <Button variant="primary" size="sm" onClick={() => editing && saveEdit(editing)} disabled={pending} isLoading={pending}>{t("save")}</Button>
          </>
        }
      >
        {editing && (
          <div className="rec-prod-form">
            <label>
              {t("importColCode")}
              <input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
            </label>
            <label>
              {t("product")}
              <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(editing); }} />
            </label>
            {editing.isLeaf && editing.depth > 0 && (
              <label>
                {t("kindLabel")}
                {kindSelect(editKind, setEditKind)}
              </label>
            )}
            {editing.isLeaf && editing.depth > 0 && (
              <div className="rec-prod-deds">
                <div className="rec-prod-deds-title">{t("tabDeductions")}</div>
                {editDeds.map((it, i) => (
                  <div className="rec-ded-row" key={i}>
                    <input value={it.label} placeholder={t("deductionName")} onChange={(e) => setEditDeds((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                    <input inputMode="decimal" value={it.pct} placeholder="%" onChange={(e) => /^\d*[.,]?\d*$/.test(e.target.value) && setEditDeds((x) => x.map((y, j) => (j === i ? { ...y, pct: e.target.value } : y)))} />
                    <span>%</span>
                    <button type="button" className="rec-link" onClick={() => setEditDeds((x) => x.filter((_, j) => j !== i))}>{t("remove")}</button>
                  </div>
                ))}
                <div className="rec-presets">
                  {PRESETS.filter((x) => !editDeds.some((d) => d.label === x)).map((x) => (
                    <button type="button" key={x} className="rec-chip" onClick={() => setEditDeds((d) => [...d, { label: x, pct: "" }])}>+ {x}</button>
                  ))}
                  <button type="button" className="rec-chip" onClick={() => setEditDeds((d) => [...d, { label: "", pct: "" }])}>+ {t("other")}</button>
                </div>
                <div className="rec-ded-total">{t("totalDeductions")}: <strong>{fmtPct(editDeds.reduce((s, d) => s + parsePct(d.pct), 0))}%</strong></div>
                <label className="rec-prod-deds-all">
                  <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
                  {t("dedApplyAll")}
                </label>
              </div>
            )}
          </div>
        )}
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
