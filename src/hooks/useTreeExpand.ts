"use client";

import { useCallback, useState } from "react";

/**
 * Estado de expandir/colapsar de uma árvore (ver src/components/ui/tree):
 * guarda só os ids COLAPSADOS (default: tudo expandido, igual ao
 * comportamento anterior de lista sempre-expandida) e evita acoplar isso à
 * seleção de qualquer outra coisa. Vários nós podem estar colapsados ao
 * mesmo tempo (ao contrário de useSingleExpand, usado noutra tela para "no
 * máximo um aberto por vez").
 */
export function useTreeExpand(initialCollapsed?: Iterable<string>) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(initialCollapsed));

  const toggle = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapse = useCallback((id: string) => {
    setCollapsedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const expand = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback((ids: Iterable<string>) => setCollapsedIds(new Set(ids)), []);
  const expandAll = useCallback(() => setCollapsedIds(new Set()), []);
  const isCollapsed = useCallback((id: string) => collapsedIds.has(id), [collapsedIds]);

  return { collapsedIds, toggle, collapse, expand, collapseAll, expandAll, isCollapsed };
}
