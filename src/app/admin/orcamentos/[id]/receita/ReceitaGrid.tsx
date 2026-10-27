"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface GridChange {
  pid: string;
  month: number; // 1..12
  field: "v" | "pr";
  value: string;
}

export interface GridRow {
  key: string;
  kind: "section" | "row" | "note";
  depth: number;
  label: string;
  toggle?: { open: boolean; onToggle: () => void };
  /** Linha editável: volume ("v") ou preço ("pr") de um produto folha. */
  editable?: { pid: string; field: "v" | "pr" };
  currency?: { value: string; options: string[]; onChange: (c: string) => void };
  /** Texto exibido na célula do mês (1..12). */
  cell: (month: number) => string;
  total: string;
  strong?: boolean;
}

interface Pos { r: number; c: number }

interface Props {
  rows: GridRow[];
  monthLabels: string[];
  readOnly: boolean;
  labels: { item: string; currency: string; total: string };
  onApply: (changes: GridChange[]) => void;
}

const NUM_RE = /^\d*[.,]?\d*$/;

/** Normaliza um texto colado (Excel pt-BR/en) para o formato do sistema; null = inválido. */
export function cleanPasted(raw: string): string | null {
  let s = raw.trim().replace(/R\$|\$|€|\s/g, "");
  if (s === "") return "";
  if (s.includes(",")) s = s.replace(/\./g, "");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return NUM_RE.test(s) ? s : null;
}

export function ReceitaGrid({ rows, monthLabels, readOnly, labels, onApply }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [focus, setFocus] = useState<Pos | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; text: string } | null>(null);
  const [drag, setDrag] = useState<"sel" | "fill" | null>(null);
  const [fillTarget, setFillTarget] = useState<Pos | null>(null);

  const rect = useMemo(() => {
    if (!anchor || !focus) return null;
    return {
      r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r),
      c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c),
    };
  }, [anchor, focus]);

  const canEdit = (r: number) => !readOnly && !!rows[r]?.editable;
  const text = (r: number, c: number) => rows[r]?.cell(c + 1) ?? "";

  function apply(changes: GridChange[]) {
    if (changes.length > 0) onApply(changes);
  }
  function change(r: number, c: number, value: string): GridChange | null {
    const e = rows[r]?.editable;
    if (!e || readOnly) return null;
    return { pid: e.pid, month: c + 1, field: e.field, value };
  }

  // ---- fill (arrastar / Ctrl+D / Ctrl+R) ----
  function fillDown(r1: number, r2: number, c1: number, c2: number, toRow: number) {
    const h = r2 - r1 + 1;
    const out: GridChange[] = [];
    const field = rows[r1]?.editable?.field;
    for (let r = r2 + 1; r <= toRow; r++) {
      if (!canEdit(r) || rows[r].editable?.field !== field) break;
      for (let c = c1; c <= c2; c++) {
        const ch = change(r, c, text(r1 + ((r - r2 - 1) % h), c));
        if (ch) out.push(ch);
      }
    }
    apply(out);
  }
  function fillRight(r1: number, r2: number, c1: number, c2: number, toCol: number) {
    const w = c2 - c1 + 1;
    const out: GridChange[] = [];
    for (let r = r1; r <= r2; r++) {
      if (!canEdit(r)) continue;
      for (let c = c2 + 1; c <= toCol; c++) {
        const ch = change(r, c, text(r, c1 + ((c - c2 - 1) % w)));
        if (ch) out.push(ch);
      }
    }
    apply(out);
  }

  function finishFill() {
    if (rect && fillTarget) {
      const dr = fillTarget.r - rect.r2;
      const dc = fillTarget.c - rect.c2;
      if (dr > 0 && dr >= dc) {
        fillDown(rect.r1, rect.r2, rect.c1, rect.c2, fillTarget.r);
        setAnchor({ r: rect.r1, c: rect.c1 });
        setFocus({ r: fillTarget.r, c: rect.c2 });
      } else if (dc > 0) {
        fillRight(rect.r1, rect.r2, rect.c1, rect.c2, fillTarget.c);
        setAnchor({ r: rect.r1, c: rect.c1 });
        setFocus({ r: rect.r2, c: fillTarget.c });
      }
    }
    setFillTarget(null);
    setDrag(null);
  }

  const finishRef = useRef(finishFill);
  finishRef.current = finishFill;
  useEffect(() => {
    if (!drag) return;
    const up = () => (drag === "fill" ? finishRef.current() : setDrag(null));
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [drag]);

  // ---- edição ----
  function startEdit(r: number, c: number, initial?: string) {
    if (!canEdit(r)) return;
    setEditing({ r, c, text: initial ?? text(r, c) });
  }
  function commitEdit(move: "down" | "right" | null) {
    if (!editing) return;
    const { r, c, text: t } = editing;
    setEditing(null);
    const v = t.trim();
    if (NUM_RE.test(v)) {
      const ch = change(r, c, v);
      if (ch) apply([ch]);
    }
    if (move === "down") moveTo(Math.min(rows.length - 1, r + 1), c, false);
    else if (move === "right") moveTo(r, Math.min(11, c + 1), false);
    wrapRef.current?.focus();
  }
  function moveTo(r: number, c: number, extend: boolean) {
    const p = { r: Math.max(0, Math.min(rows.length - 1, r)), c: Math.max(0, Math.min(11, c)) };
    if (!extend || !anchor) setAnchor(p);
    setFocus(p);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing || !focus || !anchor) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "d" || e.key === "D") && rect) {
      e.preventDefault();
      fillDown(rect.r1, rect.r1, rect.c1, rect.c2, rect.r2);
      return;
    }
    if (mod && (e.key === "r" || e.key === "R") && rect) {
      e.preventDefault();
      fillRight(rect.r1, rect.r2, rect.c1, rect.c1, rect.c2);
      return;
    }
    if (mod) return; // Ctrl+C / Ctrl+V seguem pelos eventos copy/paste
    const k = e.key;
    if (k === "ArrowDown") { e.preventDefault(); moveTo(focus.r + 1, focus.c, e.shiftKey); }
    else if (k === "ArrowUp") { e.preventDefault(); moveTo(focus.r - 1, focus.c, e.shiftKey); }
    else if (k === "ArrowLeft") { e.preventDefault(); moveTo(focus.r, focus.c - 1, e.shiftKey); }
    else if (k === "ArrowRight") { e.preventDefault(); moveTo(focus.r, focus.c + 1, e.shiftKey); }
    else if (k === "Tab") { e.preventDefault(); moveTo(focus.r, focus.c + (e.shiftKey ? -1 : 1), false); }
    else if (k === "Enter" || k === "F2") { e.preventDefault(); startEdit(anchor.r, anchor.c); }
    else if ((k === "Delete" || k === "Backspace") && rect) {
      e.preventDefault();
      const out: GridChange[] = [];
      for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) {
        const ch = change(r, c, "");
        if (ch) out.push(ch);
      }
      apply(out);
    } else if (k.length === 1 && /[0-9.,]/.test(k)) {
      e.preventDefault();
      startEdit(anchor.r, anchor.c, k);
    }
  }

  // ---- copiar / colar ----
  function onCopy(e: React.ClipboardEvent) {
    if (editing || !rect) return;
    const lines: string[] = [];
    for (let r = rect.r1; r <= rect.r2; r++) {
      const cols: string[] = [];
      for (let c = rect.c1; c <= rect.c2; c++) cols.push(text(r, c));
      lines.push(cols.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
    e.preventDefault();
  }
  function onPaste(e: React.ClipboardEvent) {
    if (editing || !rect || readOnly) return;
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;
    e.preventDefault();
    const grid = raw.replace(/\r/g, "").split("\n").map((l) => l.split("\t"));
    if (grid.length > 1 && grid[grid.length - 1].every((x) => x === "")) grid.pop();
    const out: GridChange[] = [];
    let endR = rect.r1;
    let endC = rect.c1;
    if (grid.length === 1 && grid[0].length === 1) {
      const v = cleanPasted(grid[0][0]);
      if (v === null) return;
      for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) {
        const ch = change(r, c, v);
        if (ch) out.push(ch);
      }
      endR = rect.r2;
      endC = rect.c2;
    } else {
      for (let i = 0; i < grid.length; i++) {
        const r = rect.r1 + i;
        if (r >= rows.length || !canEdit(r)) break;
        for (let j = 0; j < grid[i].length; j++) {
          const c = rect.c1 + j;
          if (c > 11) break;
          const v = cleanPasted(grid[i][j]);
          if (v === null) continue;
          const ch = change(r, c, v);
          if (ch) out.push(ch);
          endR = Math.max(endR, r);
          endC = Math.max(endC, c);
        }
      }
    }
    apply(out);
    setAnchor({ r: rect.r1, c: rect.c1 });
    setFocus({ r: endR, c: endC });
  }

  // ---- mouse ----
  function onCellDown(e: React.MouseEvent, r: number, c: number) {
    if (e.button !== 0) return;
    if (editing && (editing.r !== r || editing.c !== c)) commitEdit(null);
    if (editing && editing.r === r && editing.c === c) return;
    if (e.shiftKey && anchor) setFocus({ r, c });
    else { setAnchor({ r, c }); setFocus({ r, c }); }
    setDrag("sel");
    wrapRef.current?.focus();
  }
  function onCellEnter(r: number, c: number) {
    if (drag === "sel") setFocus({ r, c });
    else if (drag === "fill") setFillTarget({ r, c });
  }

  const fillRect = useMemo(() => {
    if (drag !== "fill" || !rect || !fillTarget) return null;
    const dr = fillTarget.r - rect.r2;
    const dc = fillTarget.c - rect.c2;
    if (dr > 0 && dr >= dc) return { r1: rect.r2 + 1, r2: fillTarget.r, c1: rect.c1, c2: rect.c2 };
    if (dc > 0) return { r1: rect.r1, r2: rect.r2, c1: rect.c2 + 1, c2: fillTarget.c };
    return null;
  }, [drag, rect, fillTarget]);

  const inRect = (r: number, c: number, x: { r1: number; r2: number; c1: number; c2: number } | null) =>
    !!x && r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2;

  return (
    <div
      className="rec-g-wrap"
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onPaste={onPaste}
    >
      <table className={`rec-g${drag ? " is-dragging" : ""}`}>
        <thead>
          <tr>
            <th className="rec-g-label">{labels.item}</th>
            <th className="rec-g-cur">{labels.currency}</th>
            {monthLabels.map((m, i) => <th key={i}>{m}</th>)}
            <th className="rec-g-total">{labels.total}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            if (row.kind === "note") {
              return (
                <tr key={row.key} className="rec-g-note"><td colSpan={15}>{row.label}</td></tr>
              );
            }
            return (
              <tr key={row.key} className={`${row.kind === "section" ? "rec-g-section" : ""}${row.strong ? " is-strong" : ""}`}>
                <td className="rec-g-label" style={{ paddingLeft: 10 + row.depth * 18 }}>
                  {row.toggle ? (
                    <button type="button" className="rec-toggle" onClick={row.toggle.onToggle} aria-expanded={row.toggle.open}>
                      {row.toggle.open ? "▾" : "▸"}
                    </button>
                  ) : <span className="rec-toggle-gap" />}
                  {row.label}
                </td>
                <td className="rec-g-cur">
                  {row.currency && (
                    <select value={row.currency.value} disabled={readOnly} onChange={(e) => row.currency!.onChange(e.target.value)}>
                      {row.currency.options.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  )}
                </td>
                {monthLabels.map((_, c) => {
                  const isEditing = editing?.r === r && editing.c === c;
                  const selected = inRect(r, c, rect);
                  const isAnchor = anchor?.r === r && anchor.c === c;
                  const isFillCorner = !!rect && !editing && !readOnly && r === rect.r2 && c === rect.c2 && canEdit(r);
                  const cls = [
                    "rec-g-cell",
                    row.editable && !readOnly ? "is-input" : "",
                    selected ? "sel" : "",
                    isAnchor ? "anchor" : "",
                    inRect(r, c, fillRect) ? "fill-preview" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <td
                      key={c}
                      className={cls}
                      onMouseDown={(e) => onCellDown(e, r, c)}
                      onMouseEnter={() => onCellEnter(r, c)}
                      onDoubleClick={() => startEdit(r, c)}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="rec-g-input"
                          inputMode="decimal"
                          value={editing.text}
                          onChange={(e) => NUM_RE.test(e.target.value) && setEditing({ ...editing, text: e.target.value })}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") { e.preventDefault(); commitEdit("down"); }
                            else if (e.key === "Tab") { e.preventDefault(); commitEdit("right"); }
                            else if (e.key === "Escape") { setEditing(null); wrapRef.current?.focus(); }
                          }}
                          onBlur={() => commitEdit(null)}
                        />
                      ) : (
                        <span>{row.cell(c + 1)}</span>
                      )}
                      {isFillCorner && (
                        <i
                          className="rec-fill"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDrag("fill"); setFillTarget(null); }}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="rec-g-total">{row.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
