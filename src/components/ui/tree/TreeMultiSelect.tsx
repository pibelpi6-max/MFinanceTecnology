"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface TreeSelectItem {
  id: string;
  name: string;
  parentId?: string | null;
}
export interface TreeSelectGroup {
  typeId: string;
  name: string;
  items: TreeSelectItem[];
}
export interface TreeMultiSelectLabels {
  all: string; // texto quando nada está selecionado (= todas)
  search: string;
  synthetic: string;
  analytic: string;
  selectAll: string;
  clear: string;
  noResults: string;
  expandAll: string;
  collapseAll: string;
  selected: (count: number) => string;
}

interface Props {
  groups: TreeSelectGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  labels: TreeMultiSelectLabels;
  ariaLabel?: string;
}

interface TNode extends TreeSelectItem {
  children: TNode[];
}

function buildForest(items: TreeSelectItem[]): TNode[] {
  const byId = new Map<string, TNode>(items.map((i) => [i.id, { ...i, children: [] }]));
  const roots: TNode[] = [];
  for (const n of Array.from(byId.values())) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

/** Seleção múltipla em árvore (várias hierarquias): expandir/recolher, busca e atalhos sintético/analítico. */
export function TreeMultiSelect({ groups, value, onChange, labels, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const forests = useMemo(() => groups.map((g) => ({ group: g, roots: buildForest(g.items) })), [groups]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const nameById = useMemo(() => new Map(allItems.map((i) => [i.id, i.name])), [allItems]);
  const parentIds = useMemo(() => new Set(allItems.map((i) => i.parentId).filter((x): x is string => !!x)), [allItems]);
  const selected = useMemo(() => new Set(value), [value]);
  const q = query.trim().toLowerCase();

  const matches = (n: TNode): boolean => n.name.toLowerCase().includes(q) || n.children.some(matches);

  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const toggleOpen = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const idsOf = (items: TreeSelectItem[], kind: "all" | "synthetic" | "analytic") =>
    items.filter((i) => (kind === "all" ? true : kind === "synthetic" ? parentIds.has(i.id) : !parentIds.has(i.id))).map((i) => i.id);
  const selectKind = (kind: "all" | "synthetic" | "analytic") => onChange(idsOf(allItems, kind));

  function renderRow(n: TNode, depth: number): React.ReactNode {
    if (q && !matches(n)) return null;
    const isOpen = q ? true : !collapsed.has(n.id);
    const has = n.children.length > 0;
    return (
      <div key={n.id}>
        <div className="tms-row" style={{ paddingLeft: 8 + depth * 18 }}>
          {has ? (
            <button type="button" className="tms-caret" onClick={() => toggleOpen(n.id)} aria-label={isOpen ? labels.collapseAll : labels.expandAll}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} style={{ transform: isOpen ? "rotate(90deg)" : undefined }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ) : (
            <span className="tms-caret" />
          )}
          <label className="tms-check">
            <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
            <span className={has ? "tms-name tms-name--syn" : "tms-name"}>{n.name}</span>
          </label>
        </div>
        {has && isOpen && n.children.map((c) => renderRow(c, depth + 1))}
      </div>
    );
  }

  const names = value.map((v) => nameById.get(v)).filter((x): x is string => !!x);
  const summary = names.length === 0 ? labels.all : names.length <= 2 ? names.join(", ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
  const anyMatch = !q || forests.some((f) => f.roots.some(matches));

  return (
    <div className="tms" ref={rootRef}>
      <button type="button" className="tms-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} title={names.join(", ")}>
        <span className={names.length === 0 ? "tms-placeholder" : undefined}>{summary}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="tms-pop">
          <input className="tms-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={labels.search} />
          <div className="tms-actions">
            <button type="button" onClick={() => selectKind("all")}>{labels.selectAll}</button>
            <button type="button" onClick={() => selectKind("synthetic")}>{labels.synthetic}</button>
            <button type="button" onClick={() => selectKind("analytic")}>{labels.analytic}</button>
            <button type="button" onClick={() => onChange([])}>{labels.clear}</button>
            <span className="tms-count">{value.length > 0 ? labels.selected(value.length) : ""}</span>
          </div>
          <div className="tms-list">
            {forests.map(({ group, roots }) => {
              if (q && !roots.some(matches)) return null;
              const gOpen = q ? true : !collapsed.has(group.typeId);
              const gIds = idsOf(group.items, "all");
              const gAll = gIds.length > 0 && gIds.every((id) => selected.has(id));
              return (
                <div key={group.typeId} className="tms-group">
                  <div className="tms-row tms-group-head">
                    <button type="button" className="tms-caret" onClick={() => toggleOpen(group.typeId)} aria-label={gOpen ? labels.collapseAll : labels.expandAll}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} style={{ transform: gOpen ? "rotate(90deg)" : undefined }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                    <label className="tms-check">
                      <input
                        type="checkbox"
                        checked={gAll}
                        onChange={() => onChange(gAll ? value.filter((v) => !gIds.includes(v)) : Array.from(new Set([...value, ...gIds])))}
                      />
                      <strong>{group.name}</strong>
                    </label>
                  </div>
                  {gOpen && roots.map((r) => renderRow(r, 1))}
                </div>
              );
            })}
            {!anyMatch && <div className="tms-empty">{labels.noResults}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
