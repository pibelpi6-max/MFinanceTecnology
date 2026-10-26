import { describe, expect, it } from "vitest";
import { reorderRow } from "./editRows";

const sheet = { headers: ["c"], rows: [["a"], ["b"], ["c"], ["d"]], fileName: "x" };

describe("reorderRow", () => {
  it("coloca a linha antes do destino e devolve o mapa de índices", () => {
    const r = reorderRow(sheet, 3, 1, "before");
    expect(r.sheet.rows.map((x) => x[0])).toEqual(["a", "d", "b", "c"]);
    expect(r.remap).toEqual([0, 2, 3, 1]);
  });
  it("coloca a linha depois do destino", () => {
    const r = reorderRow(sheet, 0, 2, "after");
    expect(r.sheet.rows.map((x) => x[0])).toEqual(["b", "c", "a", "d"]);
  });
});
