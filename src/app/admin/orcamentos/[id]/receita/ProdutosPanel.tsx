"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
  onChanged: () => void;
  onError: (s: string | null) => void;
}

type Kind = "produto" | "servico";

/**
 * Cadastro de produtos e serviços da Receita: incluir (vários de uma vez),
 * editar código/nome/tipo e excluir. A organização em grupos fica para a
 * ficha técnica (Custos); aqui os itens entram direto sob a raiz.
 */
export function ProdutosPanel({ orcamentoId, productTypeId, year, products, onChanged, onError }: Props) {
  const t = useTranslations("receita");
  const [pending, start] = useTransition();
  const root = products.find((r) => r.depth === 0);

  const [text, setText] = useState("");
  const [newKind, setNewKind] = useState<Kind>("produto");
  const [editing, setEditing] = useState<string | null>(null);
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
      onChanged();
    });
  }

  function startEdit(r: ProductRow) {
    setEditing(r.id);
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

  const kindLabel = (k: Kind) => (k === "servico" ? t("kindService") : t("kindProduct"));
  const kindSelect = (value: Kind, onChange: (k: Kind) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as Kind)}>
      <option value="produto">{t("kindProduct")}</option>
      <option value="servico">{t("kindService")}</option>
    </select>
  );

  return (
    <div className="rec-prod">
      <div className="rec-prod-add">
        <label>
          {t("prodAddLabel")}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder={t("prodAddPlaceholder")}
          />
        </label>
        <label>
          {t("kindLabel")}
          {kindSelect(newKind, setNewKind)}
        </label>
        <Button variant="primary" size="sm" onClick={add} disabled={pending || parseProductNames(text).length === 0} isLoading={pending}>
          {t("prodAddButton")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>{t("importOpen")}</Button>
      </div>
      <p className="rec-hint">{t("prodHint")}</p>
      {notice && <p className="rec-saved">{notice}</p>}

      <div className="rec-prod-list">
        <div className="rec-prod-head">
          <span className="rec-prod-col-code">{t("importColCode")}</span>
          <span className="rec-prod-col-name">{t("product")}</span>
          <span className="rec-prod-col-kind">{t("kindLabel")}</span>
        </div>
        {products.map((r) => {
          const onKey = (e: React.KeyboardEvent) => {
            if (e.key === "Enter") saveEdit(r);
            if (e.key === "Escape") setEditing(null);
          };
          const isRoot = r.depth === 0;
          return (
            <div key={r.id} className="rec-prod-row">
              {editing === r.id ? (
                <>
                  <span className="rec-prod-col-code">
                    <input className="rec-prod-code-input" value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder={t("importColCode")} onKeyDown={onKey} />
                  </span>
                  <span className="rec-prod-namecell rec-prod-col-name" style={{ paddingLeft: r.depth * 20 }}>
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={onKey} />
                  </span>
                  <span className="rec-prod-col-kind">{r.isLeaf && !isRoot ? kindSelect(editKind, setEditKind) : null}</span>
                  <span className="rec-prod-actions is-open">
                    <Button variant="primary" size="sm" onClick={() => saveEdit(r)} disabled={pending}>{t("save")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t("prodCancel")}</Button>
                  </span>
                </>
              ) : (
                <>
                  <span className="rec-prod-col-code rec-prod-code">{r.code}</span>
                  <span className="rec-prod-namecell rec-prod-col-name" style={{ paddingLeft: r.depth * 20 }}>
                    <span className={`rec-prod-name${r.isLeaf ? "" : " is-group"}`} onDoubleClick={() => startEdit(r)}>{r.name}</span>
                    <button type="button" className="rec-prod-pencil" title={t("prodRename")} aria-label={t("prodRename")} onClick={() => startEdit(r)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
                      </svg>
                    </button>
                  </span>
                  <span className="rec-prod-col-kind">
                    {r.isLeaf && !isRoot && <span className={`rec-kind rec-kind-${r.kind}`}>{kindLabel(r.kind)}</span>}
                  </span>
                  <span className="rec-prod-actions">
                    {r.isLeaf && !isRoot && <button type="button" onClick={() => setDeleting(r)}>{t("prodDelete")}</button>}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

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
