"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { parseProductNames } from "@/lib/receita/parseProductNames";
import { cancelDimensionNode, createDimensionNode, updateDimensionNode } from "../../../dimensoes/_actions";
import type { ProductRow } from "./ReceitaClient";

interface Props {
  productTypeId: string;
  year: number;
  products: ProductRow[];
  /** Produtos que já têm lançamento (não viram grupo para não perder o lançamento). */
  usedIds: Set<string>;
  onChanged: () => void;
  onError: (s: string | null) => void;
}

/** Cadastro de produtos dentro da Receita: incluir (vários de uma vez), renomear e excluir. */
export function ProdutosPanel({ productTypeId, year, products, usedIds, onChanged, onError }: Props) {
  const t = useTranslations("receita");
  const [pending, start] = useTransition();

  // Onde o novo produto entra: a raiz ou qualquer grupo (ou item ainda sem lançamentos).
  const parents = useMemo(() => products.filter((r) => !r.isLeaf || !usedIds.has(r.id)), [products, usedIds]);
  const [parentId, setParentId] = useState<string>(() => products.find((r) => r.depth === 0)?.id ?? "");
  const [text, setText] = useState("");

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
    if (!name) return;
    onError(null);
    start(async () => {
      const r = await updateDimensionNode({
        nodeId: row.id, versionId: row.versionId, currentValidFromYear: row.validFromYear,
        name, parentNodeId: row.parentId, year,
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
      </div>
      <p className="rec-hint">{t("prodHint")}</p>

      <div className="rec-prod-list">
        {products.map((r) => (
          <div key={r.id} className="rec-prod-row" style={{ paddingLeft: 10 + r.depth * 20 }}>
            {editing === r.id ? (
              <>
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
                <span className={`rec-prod-name${r.isLeaf ? "" : " is-group"}`} onDoubleClick={() => { setEditing(r.id); setEditName(r.name); }}>
                  {r.name}
                </span>
                <span className="rec-prod-code">{r.code}</span>
                <span className="rec-prod-actions">
                  <button type="button" onClick={() => { setEditing(r.id); setEditName(r.name); }}>{t("prodRename")}</button>
                  {r.isLeaf && r.depth > 0 && <button type="button" onClick={() => setDeleting(r)}>{t("prodDelete")}</button>}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

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
