import type { DimensionNodeRow } from "./types";

export interface HierarchyRow<T> {
  item: T;
  depth: number;
}

/**
 * Ordena uma lista plana de nós de dimensão em ordem hierárquica
 * (pai antes dos filhos, depth-first), calculando a profundidade de
 * cada um. Reaproveitado por qualquer tela que precise exibir uma
 * dimensão em árvore (gestão de dimensões, matriz orçamentária, etc).
 */
export function buildDimensionHierarchy(nodes: DimensionNodeRow[]) {
  const byParent = new Map<string | null, DimensionNodeRow[]>();
  nodes.forEach((n) => {
    const list = byParent.get(n.parentNodeId) ?? [];
    list.push(n);
    byParent.set(n.parentNodeId, list);
  });
  byParent.forEach((list) => {
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });

  const rows: HierarchyRow<DimensionNodeRow>[] = [];
  const depthByNodeId = new Map<string, number>();

  function walk(parentId: string | null, depth: number) {
    (byParent.get(parentId) ?? []).forEach((n) => {
      rows.push({ item: n, depth });
      depthByNodeId.set(n.id, depth);
      walk(n.id, depth + 1);
    });
  }
  walk(null, 0);

  return { rows, depthByNodeId };
}
