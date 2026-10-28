"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TreeExpand } from "./TreeExpand";
import { TreeGuides } from "./TreeGuides";

export interface FilterNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface Props {
  label: string;
  nodes: FilterNode[];
  /** Itens escolhidos; vazio = todos. */
  value: string[];
  onApply: (ids: string[]) => void;
  labels: { all: string; search: string; apply: string; noResults: string };
  disabled?: boolean;
  /** Arrastar para reordenar (a linha inteira da pílula é a alça). */
  dragProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  dragState?: "dragging" | "over" | null;
}

interface Row {
  node: FilterNode;
  depth: number;
  ancestorContinues: boolean[];
  isLast: boolean;
  hasKids: boolean;
}

/** Pílula "Hierarquia ▽" que abre uma árvore com busca, conectores, expandir/recolher e caixas de seleção. */
export function TreeFilterChip({ label, nodes, value, onApply, labels, disabled, dragProps, dragState }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { rows, parentOf, kidsOf } = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const kids = new Map<string | null, FilterNode[]>();
    const parentOf = new Map<string, string | null>();
    for (const n of nodes) {
      const par = n.parentId && ids.has(n.parentId) ? n.parentId : null;
      parentOf.set(n.id, par);
      kids.set(par, [...(kids.get(par) ?? []), n]);
    }
    const q = query.trim().toLowerCase();
    const matches = (n: FilterNode): boolean => n.name.toLowerCase().includes(q) || (kids.get(n.id) ?? []).some(matches);
    const out: Row[] = [];
    const walk = (parent: string | null, depth: number, cont: boolean[]) => {
      const list = (kids.get(parent) ?? []).filter((n) => !q || matches(n));
      list.forEach((n, i) => {
        const last = i === list.length - 1;
        const has = (kids.get(n.id) ?? []).length > 0;
        out.push({ node: n, depth, ancestorContinues: cont, isLast: last, hasKids: has });
        if (has && (q || !collapsed.has(n.id))) walk(n.id, depth + 1, [...cont, !last]);
      });
    };
    walk(null, 0, []);
    return { rows: out, parentOf, kidsOf: kids };
  }, [nodes, collapsed, query]);

  const withDescendants = (id: string, acc: Set<string> = new Set()) => {
    acc.add(id);
    for (const k of kidsOf.get(id) ?? []) withDescendants(k.id, acc);
    return acc;
  };
  /** Pai marcado só se todos os filhos estão marcados (recalcula de baixo para cima). */
  const normalize = (set: Set<string>) => {
    const n = new Set(set);
    const fix = (id: string): boolean => {
      const kids = kidsOf.get(id) ?? [];
      if (kids.length === 0) return n.has(id);
      const all = kids.map((k) => fix(k.id)).every(Boolean);
      if (all) n.add(id);
      else n.delete(id);
      return all;
    };
    for (const r of kidsOf.get(null) ?? []) fix(r.id);
    return n;
  };
  const allIds = () => new Set(nodes.map((n) => n.id));

  function openPop() {
    if (disabled) return;
    const d = new Set<string>();
    if (value.length === 0) allIds().forEach((i) => d.add(i));
    else value.forEach((v) => withDescendants(v, d));
    setDraft(d);
    setQuery("");
    setOpen((o) => !o);
  }
  const toggle = (id: string) =>
    setDraft((s) => {
      const group = withDescendants(id);
      const on = !s.has(id);
      const n = new Set(s);
      group.forEach((g) => (on ? n.add(g) : n.delete(g)));
      return normalize(n);
    });
  const toggleOpen = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allChecked = draft.size === nodes.length;
  const apply = () => {
    if (allChecked) onApply([]);
    else {
      // Cobertura mínima: os nós mais altos que estão totalmente marcados.
      const cover = nodes.filter((n) => draft.has(n.id) && !(parentOf.get(n.id) && draft.has(parentOf.get(n.id) as string))).map((n) => n.id);
      onApply(cover);
    }
    setOpen(false);
  };

  const active = value.length > 0;
  const names = value.map((v) => nodes.find((n) => n.id === v)?.name).filter(Boolean).join(", ");

  return (
    <div
      className={`tfc${dragState === "dragging" ? " is-drag" : ""}${dragState === "over" ? " is-over" : ""}`}
      ref={rootRef}
      {...dragProps}
    >
      <button type="button" className={`tfc-chip${active ? " on" : ""}`} disabled={disabled} aria-haspopup="tree" aria-expanded={open} title={names || label} onClick={openPop}>
        {label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4h18l-7 8.5V19l-4 2v-8.5Z" /></svg>
      </button>
      {open && (
        <div className="tfc-pop">
          <input className="tfc-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={labels.search} />
          <div className="tfc-list" role="tree">
            <label className="tfc-row tfc-row--all">
              <input type="checkbox" checked={allChecked} onChange={() => setDraft(allChecked ? new Set() : allIds())} />
              <span>{labels.all}</span>
            </label>
            {rows.map((r) => {
              const checked = draft.has(r.node.id);
              return (
                <div key={r.node.id} className="tfc-row" role="treeitem" aria-selected={checked}>
                  <TreeGuides ancestorContinues={r.ancestorContinues} isLast={r.isLast} depth={r.depth + 1} />
                  {r.hasKids ? <TreeExpand isOpen={!!query || !collapsed.has(r.node.id)} onToggle={() => toggleOpen(r.node.id)} /> : <span className="tree-expand-spacer" />}
                  <label className="tfc-check">
                    <input type="checkbox" checked={checked} onChange={() => toggle(r.node.id)} />
                    <span>{r.node.name}</span>
                  </label>
                </div>
              );
            })}
            {rows.length === 0 && <div className="tfc-empty">{labels.noResults}</div>}
          </div>
          <div className="tfc-foot">
            <button type="button" className="tfc-apply" onClick={apply} disabled={draft.size === 0}>{labels.apply}</button>
          </div>
        </div>
      )}
    </div>
  );
}
