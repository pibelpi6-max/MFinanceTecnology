import type { DimensionNodeRow } from "./types";

export interface HierarchyRow<T> {
  item: T;
  depth: number;
  /**
   * Para cada nível ancestral (da raiz até o pai direto), indica se aquele
   * ancestral ainda tem mais irmãos depois dele — ou seja, se a guia
   * vertical pontilhada da árvore deve continuar naquela coluna. Usado só
   * pelos componentes de árvore (ver src/components/ui/tree) para desenhar
   * os conectores; quem só precisa da indentação (`depth`) pode ignorar.
   */
  ancestorContinues: boolean[];
}

export interface DimensionHierarchy<T> {
  rows: HierarchyRow<T>[];
  depthByNodeId: Map<string, number>;
  /** ids que têm pelo menos um filho — só esses mostram o botão de expandir/colapsar. */
  hasChildren: Set<string>;
  /** ids que são o último filho do seu pai (fecha a guia vertical da árvore nessa coluna). */
  isLastChild: Set<string>;
}

/**
 * Ordena uma lista plana de nós de dimensão em ordem hierárquica
 * (pai antes dos filhos, depth-first), calculando a profundidade de
 * cada um e os metadados que os componentes de árvore precisam
 * (quem tem filho, quem é o último filho, guias de conector).
 * Reaproveitado por qualquer tela que precise exibir uma dimensão em
 * árvore (gestão de dimensões, seletor de pai, matriz orçamentária, etc).
 */
export function buildDimensionHierarchy(nodes: DimensionNodeRow[]): DimensionHierarchy<DimensionNodeRow> {
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
  const hasChildren = new Set<string>();
  const isLastChild = new Set<string>();

  function walk(parentId: string | null, depth: number, ancestorContinues: boolean[]) {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((n, i) => {
      const isLast = i === siblings.length - 1;
      rows.push({ item: n, depth, ancestorContinues });
      depthByNodeId.set(n.id, depth);
      if (isLast) isLastChild.add(n.id);
      if (byParent.has(n.id)) hasChildren.add(n.id);
      walk(n.id, depth + 1, [...ancestorContinues, !isLast]);
    });
  }
  walk(null, 0, []);

  return { rows, depthByNodeId, hasChildren, isLastChild };
}

/**
 * Filtra `rows` (já em ordem hierárquica) escondendo os descendentes de
 * qualquer id presente em `collapsedIds` — usado pelas telas com árvore
 * expansível/colapsável para decidir o que exibir, sem precisar recalcular
 * a hierarquia a cada toggle.
 */
export function getVisibleRows<T extends { id: string }>(
  rows: HierarchyRow<T>[],
  collapsedIds: ReadonlySet<string>
): HierarchyRow<T>[] {
  if (collapsedIds.size === 0) return rows;
  const result: HierarchyRow<T>[] = [];
  let hideBelowDepth: number | null = null;
  for (const row of rows) {
    if (hideBelowDepth !== null) {
      if (row.depth > hideBelowDepth) continue;
      hideBelowDepth = null;
    }
    result.push(row);
    if (collapsedIds.has(row.item.id)) hideBelowDepth = row.depth;
  }
  return result;
}
