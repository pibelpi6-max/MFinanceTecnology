"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface TreeSelectNode {
  id: string;
  name: string;
  parentId: string | null;
}

interface Props {
  nodes: TreeSelectNode[];
  value: string;
  onChange: (id: string) => void;
  /** Rótulo da opção que representa "todos" (valor "all"). */
  allLabel: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Seleção única em árvore: cada item expande/recolhe seus filhos; "Todos" no topo. */
export function TreeSelect({ nodes, value, onChange, allLabel, disabled, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
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

  const { rows, hasKids } = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const kids = new Map<string | null, TreeSelectNode[]>();
    for (const n of nodes) {
      const key = n.parentId && ids.has(n.parentId) ? n.parentId : null;
      kids.set(key, [...(kids.get(key) ?? []), n]);
    }
    const out: { node: TreeSelectNode; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const n of kids.get(parent) ?? []) {
        out.push({ node: n, depth });
        if (!collapsed.has(n.id)) walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return { rows: out, hasKids: new Set(Array.from(kids.keys()).filter(Boolean) as string[]) };
  }, [nodes, collapsed]);

  const current = value === "all" ? allLabel : nodes.find((n) => n.id === value)?.name ?? allLabel;
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="tsel" ref={rootRef}>
      <button type="button" className="tsel-btn" disabled={disabled} aria-label={ariaLabel} aria-haspopup="tree" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{current}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="tsel-pop" role="tree">
          <div role="treeitem" aria-selected={value === "all"} tabIndex={0} className={`tsel-row${value === "all" ? " on" : ""}`} onClick={() => pick("all")} onKeyDown={(e) => e.key === "Enter" && pick("all")}>
            <span className="tsel-sp" />
            {allLabel}
          </div>
          {rows.map(({ node, depth }) => (
            <div
              key={node.id}
              role="treeitem"
              aria-selected={value === node.id}
              tabIndex={0}
              className={`tsel-row${value === node.id ? " on" : ""}`}
              style={{ paddingLeft: 10 + depth * 18 }}
              onClick={() => pick(node.id)}
              onKeyDown={(e) => e.key === "Enter" && pick(node.id)}
            >
              {hasKids.has(node.id) ? (
                <button
                  type="button"
                  className={`tsel-chev${collapsed.has(node.id) ? "" : " open"}`}
                  aria-label={collapsed.has(node.id) ? "Expandir" : "Recolher"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((s) => {
                      const n = new Set(s);
                      if (n.has(node.id)) n.delete(node.id);
                      else n.add(node.id);
                      return n;
                    });
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                </button>
              ) : (
                <span className="tsel-sp" />
              )}
              {node.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
