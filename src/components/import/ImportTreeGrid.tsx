"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { findBatchProvider } from "@/lib/import/validateRows";
import type { ImportFieldConfig, ImportRowResult } from "@/lib/import/types";

interface ImportTreeGridProps {
  rows: ImportRowResult[];
  fields: ImportFieldConfig[];
  onToggleSkip: (rowIndex: number) => void;
  /** salva de uma vez os campos editados de uma linha */
  onEditRow: (rowIndex: number, values: Record<string, string>) => void;
  /** newParentRowIndex = null → vira item sem superior (nível 1) */
  onMoveRow: (rowIndex: number, newParentRowIndex: number | null) => void;
  /** contadores mostrados ao lado do título "Status" */
  counts: { ready: number; errors: number; skipped: number };
}

interface FlatRow {
  row: ImportRowResult;
  depth: number;
}

/**
 * Revisão em árvore (usada quando o layout tem um node-ref com batchRefKeys,
 * como Dimensões): as linhas aparecem recuadas conforme pai e filho, dá pra
 * editar código, nome e item superior na própria tela, e arrastar uma linha
 * (pela alça) para dentro de outra muda o item superior dela — os filhos
 * vão junto, porque continuam apontando para o código dela.
 */
export function ImportTreeGrid({ rows, fields, onToggleSkip, onEditRow, onMoveRow, counts }: ImportTreeGridProps) {
  const t = useTranslations("import");
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | "root" | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const refField = fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length)!;
    const nameKey = refField.batchRefKeys![1] ?? refField.batchRefKeys![0];

  const { flat, childrenOf } = useMemo(() => {
    const parentOf = new Map<number, number | null>();
    const childrenOf = new Map<number | null, ImportRowResult[]>();
    for (const r of rows) {
      const parent = findBatchProvider(rows, fields, r);
      const parentIndex = parent ? parent.rowIndex : null;
      parentOf.set(r.rowIndex, parentIndex);
      const list = childrenOf.get(parentIndex) ?? [];
      list.push(r);
      childrenOf.set(parentIndex, list);
    }
    const flat: FlatRow[] = [];
    const seen = new Set<number>();
    const walk = (r: ImportRowResult, depth: number) => {
      if (seen.has(r.rowIndex)) return;
      seen.add(r.rowIndex);
      flat.push({ row: r, depth });
      (childrenOf.get(r.rowIndex) ?? []).forEach((c) => walk(c, depth + 1));
    };
    (childrenOf.get(null) ?? []).forEach((r) => walk(r, 0));
    // linhas presas em ciclo não são alcançadas a partir de uma raiz
    rows.forEach((r) => walk(r, 0));
    return { flat, childrenOf };
  }, [rows, fields]);

  const descendantsOf = (index: number): Set<number> => {
    const out = new Set<number>();
    const visit = (i: number) =>
      (childrenOf.get(i) ?? []).forEach((c) => {
        if (!out.has(c.rowIndex)) {
          out.add(c.rowIndex);
          visit(c.rowIndex);
        }
      });
    visit(index);
    return out;
  };

  const blocked = dragging !== null ? descendantsOf(dragging) : new Set<number>();
  const canDrop = (target: number) => dragging !== null && target !== dragging && !blocked.has(target);

  function startEdit(row: ImportRowResult) {
    setEditing(row.rowIndex);
    setDraft(Object.fromEntries(fields.map((f) => [f.key, row.rawValues[f.key] ?? ""])));
  }

  function saveEdit(row: ImportRowResult) {
    const changed: Record<string, string> = {};
    for (const f of fields) {
      const next = (draft[f.key] ?? "").trim();
      if (next !== (row.rawValues[f.key] ?? "").trim()) changed[f.key] = next;
    }
    if (Object.keys(changed).length > 0) onEditRow(row.rowIndex, changed);
    setEditing(null);
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  return (
    <div className="import-tree-wrap">
      {dragging !== null && (
        <div
          className={`import-tree-rootzone${over === "root" ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver("root");
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            onMoveRow(dragging, null);
            endDrag();
          }}
        >
          {t("review.dropRoot")}
        </div>
      )}
      <table className="import-grid-table import-tree-table">
        <colgroup>
          <col style={{ width: 34 }} />
          <col style={{ width: 26 }} />
          <col style={{ width: 38 }} />
          {fields.map((f, i) => (
            <col key={f.key} style={i === 0 ? { width: 96 } : i === 1 ? undefined : { width: 230 }} />
          ))}
          <col style={{ width: 70 }} />
          <col style={{ width: 250 }} />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th></th>
            <th>#</th>
            {fields.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th></th>
            <th>
              <span className="import-status-head">
                {t("review.status")}
                <span className="import-count import-count-ok" title={`${counts.ready} ${t("review.countReady")}`}>{counts.ready}</span>
                {counts.errors > 0 && (
                  <span className="import-count import-count-error" title={`${counts.errors} ${t("review.countErrors")}`}>{counts.errors}</span>
                )}
                {counts.skipped > 0 && (
                  <span className="import-count import-count-skipped" title={`${counts.skipped} ${t("review.countSkipped")}`}>{counts.skipped}</span>
                )}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {flat.map(({ row, depth }) => {
            const hasErrors = Object.keys(row.errors).length > 0;
            const dropOk = over === row.rowIndex && canDrop(row.rowIndex);
            return (
              <tr
                key={row.rowIndex}
                className={[
                  row.skip ? "import-row-skipped" : hasErrors ? "import-row-error" : "",
                  dragging === row.rowIndex ? "import-row-dragging" : "",
                  dropOk ? "import-row-dropover" : "",
                ].join(" ")}
                onDragOver={(e) => {
                  if (canDrop(row.rowIndex)) {
                    e.preventDefault();
                    setOver(row.rowIndex);
                  }
                }}
                onDragLeave={() => setOver((o) => (o === row.rowIndex ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null && canDrop(row.rowIndex)) onMoveRow(dragging, row.rowIndex);
                  endDrag();
                }}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={!row.skip}
                    onChange={() => onToggleSkip(row.rowIndex)}
                    title={t("review.includeRow")}
                  />
                </td>
                <td className="import-handle-cell">
                  <span
                    className="import-drag-handle"
                    draggable={editing === null}
                    title={t("review.dragHandle")}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(row.rowIndex));
                      const tr = e.currentTarget.closest("tr");
                      if (tr) e.dataTransfer.setDragImage(tr, 0, 0);
                      setDragging(row.rowIndex);
                    }}
                    onDragEnd={endDrag}
                  >
                    ⠿
                  </span>
                </td>
                <td>{row.rowIndex + 1}</td>
                {fields.map((f) => {
                  const isName = f.key === nameKey;
                  const isEditing = editing === row.rowIndex;
                  return (
                    <td key={f.key}>
                      <div className="import-tree-cell" style={isName ? { paddingLeft: depth * 22 } : undefined}>
                        {isEditing ? (
                          <input
                            className={`import-cell-input${row.errors[f.key] ? " is-invalid" : ""}`}
                            value={draft[f.key] ?? ""}
                            autoFocus={f.key === fields[0].key}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(row);
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                        ) : (
                          <span
                            className="import-cell-text"
                            title={
                              row.notes[f.key]
                                ? t("review.suggestionTitle", { from: row.notes[f.key].from, to: row.notes[f.key].to })
                                : undefined
                            }
                          >
                            {row.notes[f.key] && !row.errors[f.key] ? (
                              <span className="import-suggest">
                                <span className="import-suggest-from">{row.notes[f.key].from}</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
                                </svg>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
                                </svg>
                                <span className="import-suggest-to">{row.notes[f.key].to}</span>
                              </span>
                            ) : (
                              row.rawValues[f.key] || "—"
                            )}
                          </span>
                        )}
                      </div>
                      {row.errors[f.key] && <div className="import-cell-error">{row.errors[f.key]}</div>}
                    </td>
                  );
                })}
                <td className="import-row-actions">
                  {editing === row.rowIndex ? (
                    <>
                      <button type="button" className="import-icon-btn is-save" title={t("review.save")} onClick={() => saveEdit(row)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" /></svg>
                      </button>
                      <button type="button" className="import-icon-btn is-cancel" title={t("review.cancelEdit")} onClick={() => setEditing(null)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </>
                  ) : (
                    <button type="button" className="import-icon-btn import-edit-btn" title={t("review.edit")} onClick={() => startEdit(row)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" /></svg>
                    </button>
                  )}
                </td>
                <td>
                  {row.skip ? (
                    <span className="import-status-tag import-status-skipped">{t("review.skipped")}</span>
                  ) : hasErrors ? (
                    <span className="import-status-tag import-status-error">{t("review.hasErrors")}</span>
                  ) : (
                    <span className="import-status-tag import-status-ok">{t("review.readyForImport")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
