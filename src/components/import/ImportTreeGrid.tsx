"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilterDropdown } from "@/components/ui/DataTable/FilterDropdown";
import type { ColumnMeta } from "@/components/ui/DataTable/types";
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

interface GridCol {
  key: string;
  label: string;
  kind: "field" | "obs" | "status";
  field?: ImportFieldConfig;
}

const OBS = "__obs";
const STATUS = "__status";
const NONE = "__none__";
const FIXED_WIDTH = 30 + 22 + 76; // controle +/-, checkbox, alça, lápis
const MIN_COL = 60;
const STORAGE_KEY = "import-tree-widths:v1";

function norm(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Revisão em árvore (usada quando o layout tem um node-ref com batchRefKeys,
 * como Dimensões): as linhas aparecem recuadas conforme pai e filho, dá pra
 * editar código, nome e item superior na própria tela, e arrastar uma linha
 * (pela alça) para dentro de outra muda o item superior dela — os filhos
 * vão junto, porque continuam apontando para o código dela.
 *
 * Colunas no padrão do DataTable: redimensionáveis e com filtro (funil),
 * sem ordenação (a ordem aqui é a hierarquia).
 */
export function ImportTreeGrid({ rows, fields, onToggleSkip, onEditRow, onMoveRow, counts }: ImportTreeGridProps) {
  const t = useTranslations("import");
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | "root" | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const refField = fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length)!;
  const codeKey = refField.batchRefKeys![0];
  const nameKey = refField.batchRefKeys![1] ?? codeKey;

  // Colunas exibidas: o Item Superior vira "Observações da AI".
  const cols: GridCol[] = useMemo(
    () => [
      ...fields.map<GridCol>((f) =>
        f.key === refField.key
          ? { key: OBS, label: t("review.aiNotes"), kind: "obs", field: f }
          : { key: f.key, label: f.label, kind: "field", field: f }
      ),
      { key: STATUS, label: t("review.status"), kind: "status" },
    ],
    [fields, refField.key, t]
  );

  // ── Árvore ─────────────────────────────────────────────────
  const { flat, childrenOf, parents } = useMemo(() => {
    const childrenOf = new Map<number | null, ImportRowResult[]>();
    for (const r of rows) {
      const parent = findBatchProvider(rows, fields, r);
      const parentIndex = parent ? parent.rowIndex : null;
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
    const parents = Array.from(childrenOf.entries())
      .filter(([k, v]) => k !== null && v.length > 0)
      .map(([k]) => k as number);
    return { flat, childrenOf, parents };
  }, [rows, fields]);

  // ── Observações da AI (sugestões e problemas da linha) ─────
  const noteOf = useCallback(
    (row: ImportRowResult) => (row.errors[refField.key] ? null : (row.notes[refField.key] ?? null)),
    [refField.key]
  );
  const errorsOf = useCallback((row: ImportRowResult) => Object.values(row.errors).filter(Boolean), []);
  const obsText = useCallback(
    (row: ImportRowResult) => {
      const note = noteOf(row);
      const parts = [
        note ? `${t("review.suggestionFrom")} ${note.from} → ${t("review.suggestionTo")} ${note.to}` : "",
        errorsOf(row).join(" · "),
      ].filter(Boolean);
      return parts.join(" · ");
    },
    [noteOf, errorsOf, t]
  );
  const statusOf = (row: ImportRowResult): "ready" | "error" | "skipped" =>
    row.skip ? "skipped" : Object.keys(row.errors).length > 0 ? "error" : "ready";

  // ── Filtros por coluna (padrão DataTable) ──────────────────
  const [applied, setApplied] = useState<Record<string, Set<string>>>({});
  const [pending, setPending] = useState<Record<string, Set<string>>>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const filterValue = useCallback(
    (row: ImportRowResult, col: GridCol): string => {
      if (col.kind === "status") return statusOf(row);
      if (col.kind === "obs") return obsText(row) || NONE;
      return (row.rawValues[col.key] ?? "").trim();
    },
    [obsText]
  );
  const filterLabels = (col: GridCol): Record<string, string> | undefined => {
    if (col.kind === "status")
      return { ready: t("review.readyForImport"), error: t("review.hasErrors"), skipped: t("review.skipped") };
    if (col.kind === "obs") return { [NONE]: t("review.noObservation") };
    return undefined;
  };
  const optionsFor = (col: GridCol): Array<[string, number]> => {
    const counts: Record<string, number> = {};
    flat.forEach(({ row }) => {
      const v = filterValue(row, col);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    });
    const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
    return Object.entries(counts).sort((a, b) => collator.compare(a[0], b[0]));
  };

  const totalFilters = Object.values(applied).reduce((s, v) => s + v.size, 0);
  const isFiltering = totalFilters > 0;
  const matches = (row: ImportRowResult) =>
    Object.entries(applied).every(([colKey, set]) => {
      if (set.size === 0) return true;
      const col = cols.find((c) => c.key === colKey);
      return col ? set.has(filterValue(row, col)) : true;
    });

  function positionDropdown(colKey: string) {
    const th = thRefs.current[colKey];
    const card = cardRef.current;
    if (!th || !card) return;
    const thRect = th.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const width = 220;
    let left = thRect.right - cardRect.left - width;
    left = Math.max(0, Math.min(left, cardRect.width - width));
    setDropdownPos({ top: thRect.bottom - cardRect.top, left });
  }
  function openFilter(colKey: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (openCol === colKey) {
      setOpenCol(null);
      setDropdownPos(null);
      return;
    }
    setPending((p) => ({ ...p, [colKey]: new Set(applied[colKey] ?? []) }));
    positionDropdown(colKey);
    setOpenCol(colKey);
  }
  function togglePending(val: string) {
    if (!openCol) return;
    setPending((p) => {
      const next = new Set(p[openCol] ?? []);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return { ...p, [openCol]: next };
    });
  }
  function applyFilter() {
    if (!openCol) return;
    setApplied((a) => ({ ...a, [openCol]: new Set(pending[openCol] ?? []) }));
    setOpenCol(null);
    setDropdownPos(null);
  }
  const closeDropdown = useCallback(() => {
    setOpenCol(null);
    setDropdownPos(null);
  }, []);

  // ── Larguras redimensionáveis (padrão DataTable) ───────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const [resizeHover, setResizeHover] = useState<string | null>(null);

  useLayoutEffect(() => {
    let saved: Record<string, number> = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
    } catch {
      saved = {};
    }
    const total = wrapRef.current?.clientWidth ?? 900;
    const status = 210;
    const avail = Math.max(420, total - FIXED_WIDTH - status);
    const code = 96;
    const name = Math.round((avail - code) * 0.4);
    const defaults: Record<string, number> = {
      [codeKey]: code,
      [nameKey]: name,
      [OBS]: avail - code - name,
      [STATUS]: status,
    };
    setWidths({ ...defaults, ...saved });
  }, [codeKey, nameKey]);

  const widthOf = (key: string) => widths[key] ?? 140;

  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(key);
    const onMove = (ev: MouseEvent) =>
      setWidths((w) => ({ ...w, [key]: Math.max(MIN_COL, startW + ev.clientX - startX) }));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setResizeHover(null);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widthsRef.current));
      } catch {
        /* sem persistência: tudo bem */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Recolher / expandir ────────────────────────────────────
  const visible = useMemo(() => {
    if (isFiltering) return flat.filter(({ row }) => matches(row));
    const hidden = new Set<number>();
    const hide = (i: number) =>
      (childrenOf.get(i) ?? []).forEach((c) => {
        if (!hidden.has(c.rowIndex)) {
          hidden.add(c.rowIndex);
          hide(c.rowIndex);
        }
      });
    collapsed.forEach(hide);
    return flat.filter((f) => !hidden.has(f.row.rowIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, childrenOf, collapsed, applied, isFiltering, rows]);

  const allCollapsed = parents.length > 0 && parents.every((p) => collapsed.has(p));
  const toggleCollapse = (i: number) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  // ── Arrastar para mudar o item superior ────────────────────
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

  // ── Edição por linha ───────────────────────────────────────
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

  const hiddenCount = flat.length - visible.length;
  const totalWidth = FIXED_WIDTH + cols.reduce((s, c) => s + widthOf(c.key), 0);

  // ── Células ────────────────────────────────────────────────
  function renderObs(row: ImportRowResult) {
    if (editing === row.rowIndex) {
      return (
        <input
          className={`import-cell-input${row.errors[refField.key] ? " is-invalid" : ""}`}
          value={draft[refField.key] ?? ""}
          placeholder={t("review.parentPlaceholder")}
          aria-label={refField.label}
          onChange={(e) => setDraft((d) => ({ ...d, [refField.key]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit(row);
            if (e.key === "Escape") setEditing(null);
          }}
        />
      );
    }
    const note = noteOf(row);
    const errs = errorsOf(row);
    if (!note && errs.length === 0) return null;
    return (
      <div className="import-obs" title={obsText(row)}>
        {note && (
          <span className="import-suggest">
            <span className="import-suggest-label">{t("review.suggestionFrom")}</span>
            <span className="import-suggest-from">{note.from}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
            </svg>
            <span className="import-suggest-label">{t("review.suggestionTo")}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
            </svg>
            <span className="import-suggest-to">{note.to}</span>
          </span>
        )}
        {errs.length > 0 && (
          <span className={`import-obs-error${note ? " is-single" : ""}`}>{errs.join(" · ")}</span>
        )}
      </div>
    );
  }

  const sparkles = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="import-ai-icon">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  );

  const openColumn = cols.find((c) => c.key === openCol);
  const dropdownColumn: ColumnMeta<unknown> | null = openColumn
    ? { key: openColumn.key, label: openColumn.label, filterValueLabels: filterLabels(openColumn) }
    : null;

  return (
    <div className="import-tree-wrap">
      {isFiltering && (
        <div className="import-filter-chips">
          <span>{t("review.filtersActive")}</span>
          {Object.entries(applied).flatMap(([colKey, set]) =>
            Array.from(set).map((val) => {
              const col = cols.find((c) => c.key === colKey);
              const label = (col && filterLabels(col)?.[val]) ?? val;
              return (
                <span key={`${colKey}-${val}`} className="import-filter-chip">
                  {col?.label ?? colKey}: {label}
                  <button
                    type="button"
                    aria-label={t("review.removeFilter")}
                    onClick={() =>
                      setApplied((a) => {
                        const next = new Set(a[colKey]);
                        next.delete(val);
                        return { ...a, [colKey]: next };
                      })
                    }
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              );
            })
          )}
          <button type="button" className="import-filter-clear" onClick={() => setApplied({})}>
            {t("review.clearFilters")}
          </button>
        </div>
      )}

      <div ref={cardRef} className="import-tree-card">
        <div ref={wrapRef} className="import-tree-scroll">
          <table className="import-grid-table import-tree-table" style={{ minWidth: totalWidth }}>
            <colgroup>
              <col style={{ width: 30 }} />
              <col style={{ width: 22 }} />
              {cols
                .filter((c) => c.kind !== "status")
                .map((c) => (
                  <col key={c.key} style={{ width: widthOf(c.key) }} />
                ))}
              <col />
              <col style={{ width: 76 }} />
              <col style={{ width: widthOf(STATUS) }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th></th>
                {cols
                  .filter((c) => c.kind !== "status")
                  .map((c) => (
                    <HeaderCell
                      key={c.key}
                      col={c}
                      icon={c.kind === "obs" ? sparkles : null}
                      isFiltered={(applied[c.key]?.size ?? 0) > 0}
                      isOpen={openCol === c.key}
                      hover={resizeHover === c.key}
                      thRef={(el) => {
                        thRefs.current[c.key] = el;
                      }}
                      onFilter={(e) => openFilter(c.key, e)}
                      onResize={(e) => startResize(e, c.key)}
                      onHover={(on) => setResizeHover(on ? c.key : null)}
                      filterLabel={t("review.filterColumn", { column: c.label })}
                    />
                  ))}
                <th aria-hidden="true" className="import-th-spacer"></th>
                <th className="import-th import-th-actions">
                  {t("review.actions")}
                  <div className="import-th-divider" />
                </th>
                {(() => {
                  const c = cols.find((x) => x.kind === "status")!;
                  return (
                    <HeaderCell
                      col={c}
                      icon={null}
                      isFiltered={(applied[c.key]?.size ?? 0) > 0}
                      isOpen={openCol === c.key}
                      hover={resizeHover === c.key}
                      thRef={(el) => {
                        thRefs.current[c.key] = el;
                      }}
                      onFilter={(e) => openFilter(c.key, e)}
                      onResize={(e) => startResize(e, c.key)}
                      onHover={(on) => setResizeHover(on ? c.key : null)}
                      filterLabel={t("review.filterColumn", { column: c.label })}
                      extra={
                        <span className="import-status-head">
                          <span className="import-count import-count-ok">{t("review.countReadyLabel", { count: counts.ready })}</span>
                          {counts.errors > 0 && (
                            <span className="import-count import-count-error">{t("review.countErrorLabel", { count: counts.errors })}</span>
                          )}
                          {counts.skipped > 0 && (
                            <span className="import-count import-count-skipped">{t("review.countSkippedLabel", { count: counts.skipped })}</span>
                          )}
                        </span>
                      }
                    />
                  );
                })()}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 4} className="import-tree-empty">
                    {t("review.noRowsFiltered")}
                  </td>
                </tr>
              )}
              {visible.map(({ row, depth }) => {
                const hasErrors = Object.keys(row.errors).length > 0;
                const dropOk = over === row.rowIndex && canDrop(row.rowIndex);
                const isParent = (childrenOf.get(row.rowIndex)?.length ?? 0) > 0;
                return (
                  <tr
                    key={row.rowIndex}
                    className={[
                      row.skip ? "import-row-skipped" : hasErrors ? "import-row-error" : "",
                      isParent ? "import-row-parent" : "",
                      dragging === row.rowIndex ? "import-row-dragging" : "",
                      dropOk ? "import-row-dropover" : "",
                    ].join(" ")}
                    onDragEnter={(e) => {
                      if (canDrop(row.rowIndex)) e.preventDefault();
                    }}
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
                          const idx = row.rowIndex;
                          setTimeout(() => setDragging(idx), 0);
                        }}
                        onDragEnd={endDrag}
                      >
                        ⠿
                      </span>
                    </td>
                    {cols
                      .filter((c) => c.kind !== "status")
                      .map((c) => {
                        if (c.kind === "obs") return <td key={c.key}>{renderObs(row)}</td>;
                        const f = c.field!;
                        const isName = f.key === nameKey;
                        const isEditing = editing === row.rowIndex;
                        return (
                          <td key={c.key}>
                            <div className="import-tree-cell" style={isName ? { paddingLeft: depth * 24 } : undefined}>
                              {isName &&
                                (isParent && !isFiltering ? (
                                  <button
                                    type="button"
                                    className={`import-chevron${collapsed.has(row.rowIndex) ? " is-collapsed" : ""}`}
                                    onClick={() => toggleCollapse(row.rowIndex)}
                                    title={collapsed.has(row.rowIndex) ? t("review.expand") : t("review.collapse")}
                                    aria-label={`${collapsed.has(row.rowIndex) ? t("review.expand") : t("review.collapse")}: ${row.rawValues[nameKey] ?? ""}`}
                                    aria-expanded={!collapsed.has(row.rowIndex)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                                    </svg>
                                  </button>
                                ) : (
                                  <span className="import-chevron-spacer" />
                                ))}
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
                                <span className={`import-cell-text${row.errors[f.key] ? " is-invalid" : ""}`}>
                                  {row.rawValues[f.key] || "—"}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    <td></td>
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

        {dropdownColumn && (
          <FilterDropdown
            open={openCol !== null}
            position={dropdownPos}
            column={dropdownColumn}
            options={openColumn ? optionsFor(openColumn) : []}
            pendingSelection={pending[openCol ?? ""] ?? new Set()}
            onTogglePending={togglePending}
            onApply={applyFilter}
            onClear={() => openCol && setPending((p) => ({ ...p, [openCol]: new Set() }))}
            onClose={closeDropdown}
          />
        )}
      </div>

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

      <p className="import-tree-footer">
        {isFiltering
          ? t("review.filteredFooter", { shown: visible.length, total: flat.length })
          : hiddenCount > 0
            ? t("review.hiddenFooter", { count: hiddenCount })
            : t("review.allVisibleFooter", { count: flat.length })}
      </p>
    </div>
  );
}

interface HeaderCellProps {
  col: GridCol;
  icon: React.ReactNode;
  isFiltered: boolean;
  isOpen: boolean;
  hover: boolean;
  thRef: (el: HTMLTableCellElement | null) => void;
  onFilter: (e: React.MouseEvent) => void;
  onResize: (e: React.MouseEvent) => void;
  onHover: (on: boolean) => void;
  filterLabel: string;
  extra?: React.ReactNode;
  /** Botões à direita do título, colados ao ícone de filtro. */
  actions?: React.ReactNode;
}

/** Cabeçalho no padrão do DataTable: rótulo, funil de filtro, divisor e alça de redimensionar. */
function HeaderCell({ col, icon, isFiltered, isOpen, hover, thRef, onFilter, onResize, onHover, filterLabel, extra, actions }: HeaderCellProps) {
  return (
    <th
      ref={thRef}
      className={`import-th${isFiltered ? " is-filtered" : ""}${hover ? " is-resize-hover" : ""}`}
    >
      <div className={`import-th-inner${actions ? " has-actions" : ""}`}>
        <span className="import-th-label">
          {icon}
          {col.label}
        </span>
        {extra}
        {actions}
        <button
          type="button"
          className={`import-th-funnel${isFiltered || isOpen ? " is-on" : ""}`}
          onClick={onFilter}
          aria-label={filterLabel}
          title={filterLabel}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isFiltered ? "rgba(92,184,138,0.2)" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591L15.75 12.75V19.5a.75.75 0 0 1-.44.693l-3 1.5a.75.75 0 0 1-1.06-.693v-5.443L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"
            />
          </svg>
        </button>
      </div>
      <div
        className="import-resize"
        onMouseDown={onResize}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        aria-hidden="true"
      />
      <div className="import-th-divider" />
    </th>
  );
}
