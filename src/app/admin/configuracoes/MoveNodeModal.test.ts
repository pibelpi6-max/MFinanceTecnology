import { describe, expect, it } from "vitest";
import { canPlace, validMoveTargets } from "./MoveNodeModal";
import type { DimensionNodeRow } from "@/lib/dimensions/types";

const n = (id: string, parentNodeId: string | null, level: number): DimensionNodeRow => ({
  id, versionId: `v-${id}`, code: id, name: id, parentNodeId, level, validFromYear: 2026, validUntilYear: null,
});

describe("validMoveTargets", () => {
  // raiz > a > a1 > a2 ; raiz > b
  const nodes = [n("raiz", null, 1), n("a", "raiz", 2), n("a1", "a", 3), n("a2", "a1", 4), n("b", "raiz", 2)];

  it("não oferece o próprio item, os de baixo nem o pai atual", () => {
    const ids = validMoveTargets(nodes, nodes[1]).map((x) => x.id); // mover "a"
    expect(ids).toEqual(["b"]); // raiz é o pai atual; a1/a2 estão abaixo
  });

  it("permite mover uma folha para outro ramo", () => {
    const ids = validMoveTargets(nodes, nodes[3]).map((x) => x.id); // mover "a2" (pai atual: a1)
    expect(ids.sort()).toEqual(["a", "b", "raiz"]);
  });

  it("respeita o limite de 10 níveis", () => {
    const deep: DimensionNodeRow[] = [n("r", null, 1)];
    for (let i = 2; i <= 10; i++) deep.push(n(`l${i}`, i === 2 ? "r" : `l${i - 1}`, i));
    const x = n("x", "r", 2);
    const y = n("y", "x", 3);
    // mover x (com y embaixo, altura 1) para l9 (nível 9): x=10, y=11 → inválido; para l8: ok
    const ids = validMoveTargets([...deep, x, y], x).map((t) => t.id);
    expect(ids).toContain("l8");
    expect(ids).not.toContain("l9");
    expect(ids).not.toContain("l10");
  });
});

describe("canPlace", () => {
  // raiz > a > a1 ; raiz > b ; raiz > c
  const nodes = [n("raiz", null, 1), n("a", "raiz", 2), n("a1", "a", 3), n("b", "raiz", 2), n("c", "raiz", 2)];
  const by = (id: string) => nodes.find((x) => x.id === id)!;

  it("reordena entre irmãos (antes/depois)", () => {
    expect(canPlace(nodes, by("a"), by("b"), "after")).toBe(true);
    expect(canPlace(nodes, by("c"), by("a"), "before")).toBe(true);
  });
  it("não coloca nada ao lado do item raiz", () => {
    expect(canPlace(nodes, by("a"), by("raiz"), "before")).toBe(false);
    expect(canPlace(nodes, by("a"), by("raiz"), "after")).toBe(false);
  });
  it("não solta um item dentro dele mesmo ou de um filho", () => {
    expect(canPlace(nodes, by("a"), by("a"), "inside")).toBe(false);
    expect(canPlace(nodes, by("a"), by("a1"), "inside")).toBe(false);
    expect(canPlace(nodes, by("a"), by("a1"), "after")).toBe(false);
  });
  it("muda de pai ao soltar dentro de outro ou ao lado de um primo", () => {
    expect(canPlace(nodes, by("c"), by("b"), "inside")).toBe(true);
    expect(canPlace(nodes, by("c"), by("a1"), "after")).toBe(true); // vira filho de "a"
  });
});
