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
import { importProdutos, setItemKind } from "./_actions";
import { ImportProdutosModal } from "./ImportProdutosModal";
import type { ProductRow } from "./ReceitaClient";

interface Props {
  orcamentoId: string;
  productTypeId: string;
  year: number;
  products: ProductRow[];
  initialPrefs?: TablePrefs;
  onChanged: () => void;
  onError: (s: string | null) => void;
}

type Kind = "produto" | "servico";

/**
 * Cadastro de produtos e serviços da Receita: incluir (vários de uma vez),
 * editar código/nome/tipo e excluir. A organização em grupos fica para a
 * ficha técnica (Custos); aqui os itens entram direto sob a raiz.
 */
export function ProdutosPanel({ orcamentoId, productTypeId, year, products, initialPrefs, onChanged, onError }: Props) {
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
        size="sm"
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
