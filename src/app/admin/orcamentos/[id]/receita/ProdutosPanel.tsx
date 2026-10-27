"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { parseProductNames } from "@/lib/receita/parseProductNames";
import { cancelDimensionNode, createDimensionNode, updateDimensionNode } from "../../../dimensoes/_actions";
import { ImportProdutosModal } from "./ImportProdutosModal";
import type { ProductRow } from "./ReceitaClient";

interface Props {
  orcamentoId: string;
  productTypeId: string;
  year: number;
  products: ProductRow[];
  /** Produtos que já têm lançamento (não viram grupo para não perder o lançamento). */
  usedIds: Set<string>;
  onChanged: () => void;
  onError: (s: string | null) => void;
}

/** Cadastro de produtos dentro da Receita: incluir (vários de uma vez), renomear e excluir. */
export function ProdutosPanel({ orcamentoId, productTypeId, year, products, usedIds, onChanged, onError }: Props) {
  const t = useTranslations("receita");
  const [pending, start] = useTransition();

  // Onde o novo produto entra: a raiz ou qualquer grupo (ou item ainda sem lançamentos).
  const parents = useMemo(() => products.filter((r) => !r.isLeaf || !usedIds.has(r.id)), [products, usedIds]);
  const [parentId, setParentId] = useState<string>(() => products.find((r) => r.depth === 0)?.id ?? "");
  const [text, setText] = useState("");

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);

  function nextCodes(n: number): string[] {
    const nums = products.map((r) => /^P(\d+)$/.exec(r.code)).filter(Boolean).map((m) => Number(m![1]));
    let cur = nums.length ? Math.max(...nums) : 0;
    return Array.from({ length: n }, () => `P${String(++cur).padStart(3, "0")}`);
  }

  function add() {
    const names = parseProductNames(text);
    if (names.length === 0 || !parentId) return;
    onError(null);
    const codes = nextCodes(names.length);
    start(async () => {
      for (let i = 0; i < names.length; i++) {
        const r = await createDimensionNode({ dimensionTypeId: productTypeId, code: codes[i], name: names[i], parentNodeId: parentId, year });
        if (r.error) { onError(`"${names[i]}": ${r.error}`); onChanged(); return; }
      }
      setText("");
      onChanged();
    });
  }

  function saveRename(row: ProductRow) {
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
          {t("prodInside")}
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            {parents.map((r) => (
              <option key={r.id} value={r.id}>{`${"— ".repeat(r.depth)}${r.name}`}</option>
            ))}
          </select>
        </label>
        <Button variant="primary" size="sm" onClick={add} disabled={pending || parseProductNames(text).length === 0} isLoading={pending}>
          {t("prodAddButton")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>{t("importOpen")}</Button>
      </div>
      <p className="rec-hint">{t("prodHint")}</p>
      {notice && <p className="rec-saved">{notice}</p>}

      <div className="rec-prod-list">
        {products.map((r) => (
          <div key={r.id} className="rec-prod-row" style={{ paddingLeft: 10 + r.depth * 20 }}>
            {editing === r.id ? (
              <>
                <input
                  className="rec-prod-code-input"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  placeholder={t("importColCode")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(r);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(r);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <Button variant="primary" size="sm" onClick={() => saveRename(r)} disabled={pending}>{t("save")}</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>{t("prodCancel")}</Button>
              </>
            ) : (
              <>
                <span className="rec-prod-code">{r.code}</span>
                <span className={`rec-prod-name${r.isLeaf ? "" : " is-group"}`} onDoubleClick={() => { setEditing(r.id); setEditName(r.name); setEditCode(r.code); }}>
                  {r.name}
                </span>
                <button
                  type="button"
                  className="rec-prod-pencil"
                  title={t("prodRename")}
                  aria-label={t("prodRename")}
                  onClick={() => { setEditing(r.id); setEditName(r.name); setEditCode(r.code); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
                  </svg>
                </button>
                <span className="rec-prod-actions">
                  {r.isLeaf && r.depth > 0 && <button type="button" onClick={() => setDeleting(r)}>{t("prodDelete")}</button>}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {importOpen && (
        <ImportProdutosModal
          open
          onClose={() => setImportOpen(false)}
          orcamentoId={orcamentoId}
          productTypeId={productTypeId}
          products={products}
          usedIds={usedIds}
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
