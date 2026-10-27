import { describe, expect, it } from "vitest";
import { parseProductNames } from "./parseProductNames";

describe("parseProductNames", () => {
  it("aceita uma linha por produto", () => {
    expect(parseProductNames("A\nB\nC")).toEqual(["A", "B", "C"]);
  });
  it("aceita vírgula e ponto e vírgula", () => {
    expect(parseProductNames("Produto A, Produto B; Produto C")).toEqual(["Produto A", "Produto B", "Produto C"]);
  });
  it("remove vazios e duplicados", () => {
    expect(parseProductNames("A,, a ,\n B")).toEqual(["A", "B"]);
  });
});
