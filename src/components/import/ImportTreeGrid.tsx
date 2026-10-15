"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { findBatchProvider } from "@/lib/import/validateRows";
import type { ImportFieldConfig, ImportRowResult } from "@/lib/import/types";

interface ImportTreeGridProps {
  rows: ImportRowResult[];
  fields: ImportFieldConfig[];
  onToggleSkip: (rowIndex: number) => void;
  onEditCell: (rowIndex: number, key: string, value: string) => void;
  /** newParentRowIndex = null → vira item sem superior (nível 1) */
  onMoveRow: (rowIndex: number, newParentRowIndex: number | null) => void;
}

interface FlatRow {
  row: ImportRowResult;
  depth: number;
}

function CellInput({ value, onCommit, invalid }: { value: string; onCommit: (v: string) => void; invalid: boolean }) {
  return (
    <input
      key={value}
      className={`import-cell-input${invalid ? " is-invalid" : ""}`}
      defaultValue={value}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (next !== value.trim()) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * Revisão em árvore (usada quando o layout tem um node-ref com batchRefKeys,
 * como Dimensões): as linhas aparecem recuadas conforme pai e filho, dá pra
 * editar código, nome e item superior na própria tela, e arrastar uma linha
 * (pela alça) para dentro de outra muda o item superior dela — os filhos
 * vão junto, porque continuam apontando para o código dela.
 */
export function ImportTreeGrid({ rows, fields, onToggleSkip, onEditCell, onMoveRow }: ImportTreeGridProps) {
  const t = useTranslations("import");
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | "root" | null>(null);

  const refField = fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length)!;
  const codeKey = refField.batchRefKeys![0];
  const nameKey = refField.batchRefKeys![1] ?? codeKey;
  const editableKeys = fields.map((f) => f.key);

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

  function endDrag() {
    setDragging(null);
    setOver(null);
  }

  return (
    <div className="import-grid-wrap">
      <p className="import-tree-hint">{t("review.dragHint")}</p>
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
      <table className="import-grid-table">
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            {fields.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th>{t("review.status")}</th>
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
                <td>{row.rowIndex + 1}</td>
                {fields.map((f) => {
                  const isCode = f.key === codeKey;
                  return (
                    <td key={f.key}>
                      <div
                        className="import-tree-cell"
                        style={isCode ? { paddingLeft: depth * 22 } : undefined}
                      >
                        {isCode && (
                          <span
                            className="import-drag-handle"
                            draggable
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
                        )}
                        {isCode && depth > 0 && <span className="import-tree-elbow" aria-hidden="true" />}
                        {editableKeys.includes(f.key) ? (
                          <CellInput
                            value={row.rawValues[f.key] ?? ""}
                            invalid={!!row.errors[f.key]}
                            onCommit={(v) => onEditCell(row.rowIndex, f.key, v)}
                          />
                        ) : (
                          row.rawValues[f.key] || "—"
                        )}
                      </div>
                      {row.notes[f.key] && !row.errors[f.key] && (
                        <div className="import-cell-note">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-label={t("review.suggestion")}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
                          </svg>
                          <span>{row.notes[f.key]}</span>
                        </div>
                      )}
                      {row.errors[f.key] && <div className="import-cell-error">{row.errors[f.key]}</div>}
                    </td>
                  );
                })}
                <td>
                  {row.skip ? (
                    <span className="import-status-tag import-status-skipped">{t("review.skipped")}</span>
                  ) : hasErrors ? (
                    <span className="import-status-tag import-status-error">{t("review.hasErrors")}</span>
                  ) : (
                    <span className="import-status-tag import-status-ok">{t("review.ready")}</span>
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
