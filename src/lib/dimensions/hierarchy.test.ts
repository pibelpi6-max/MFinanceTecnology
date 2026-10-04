import { describe, it, expect } from "vitest";
import { buildDimensionHierarchy, getVisibleRows } from "./hierarchy";
import type { DimensionNodeRow } from "./types";

function makeNode(overrides: Partial<DimensionNodeRow>): DimensionNodeRow {
  return {
    id: "n1",
    versionId: "v1",
    code: "N1",
    name: "N1",
    parentNodeId: null,
    level: 1,
    validFromYear: 2026,
    validUntilYear: null,
    ...overrides,
  };
}

// Árvore de teste:
// A (raiz)
//  ├─ B
//  │   └─ D
//  └─ C
const A = makeNode({ id: "A", name: "A", parentNodeId: null });
const B = makeNode({ id: "B", name: "B", parentNodeId: "A" });
const C = makeNode({ id: "C", name: "C", parentNodeId: "A" });
const D = makeNode({ id: "D", name: "D", parentNodeId: "B" });

describe("buildDimensionHierarchy", () => {
  it("ordena pai antes dos filhos, em ordem alfabética entre irmãos", () => {
    const { rows } = buildDimensionHierarchy([C, A, D, B]);
    expect(rows.map((r) => r.item.id)).toEqual(["A", "B", "D", "C"]);
  });

  it("calcula depth corretamente", () => {
    const { rows } = buildDimensionHierarchy([A, B, C, D]);
    const depthOf = (id: string) => rows.find((r) => r.item.id === id)?.depth;
    expect(depthOf("A")).toBe(0);
    expect(depthOf("B")).toBe(1);
    expect(depthOf("C")).toBe(1);
    expect(depthOf("D")).toBe(2);
  });

  it("identifica quem tem filho e quem é o último filho do pai", () => {
    const { hasChildren, isLastChild } = buildDimensionHierarchy([A, B, C, D]);
    expect(hasChildren.has("A")).toBe(true);
    expect(hasChildren.has("B")).toBe(true);
    expect(hasChildren.has("C")).toBe(false);
    expect(hasChildren.has("D")).toBe(false);

    // Irmãos de A: só A -> último. Irmãos de B/C (filhos de A, ordem alfabética B,C) -> C é o último.
    expect(isLastChild.has("A")).toBe(true);
    expect(isLastChild.has("B")).toBe(false);
    expect(isLastChild.has("C")).toBe(true);
    expect(isLastChild.has("D")).toBe(true);
  });

  it("ancestorContinues tem o tamanho igual ao depth e reflete se o ancestral tem mais irmãos depois", () => {
    const { rows } = buildDimensionHierarchy([A, B, C, D]);
    const rowD = rows.find((r) => r.item.id === "D")!;
    // D (depth 2): ancestrais são [A, B]. A é único (não continua); B não é
    // o último filho de A (C vem depois) -> continua.
    expect(rowD.ancestorContinues).toEqual([false, true]);

    const rowC = rows.find((r) => r.item.id === "C")!;
    // C (depth 1): ancestral é [A], que é único -> não continua.
    expect(rowC.ancestorContinues).toEqual([false]);
  });
});

describe("getVisibleRows", () => {
  const { rows } = buildDimensionHierarchy([A, B, C, D]);

  it("sem ids colapsados, retorna tudo", () => {
    expect(getVisibleRows(rows, new Set()).map((r) => r.item.id)).toEqual(["A", "B", "D", "C"]);
  });

  it("colapsar um nó esconde só os descendentes dele, não ele mesmo nem os irmãos", () => {
    const visible = getVisibleRows(rows, new Set(["B"]));
    // B continua visível (só os FILHOS de B -- aqui, D -- somem); C (irmão
    // de B, não descendente) continua visível.
    expect(visible.map((r) => r.item.id)).toEqual(["A", "B", "C"]);
  });

  it("colapsar a raiz esconde toda a árvore abaixo dela", () => {
    const visible = getVisibleRows(rows, new Set(["A"]));
    expect(visible.map((r) => r.item.id)).toEqual(["A"]);
  });

  it("colapsar um nó sem filhos não afeta mais ninguém", () => {
    const visible = getVisibleRows(rows, new Set(["C"]));
    expect(visible.map((r) => r.item.id)).toEqual(["A", "B", "D", "C"]);
  });
});
