import { describe, expect, it } from "vitest";
import { parseClipboardText } from "./PasteGrid";

describe("parseClipboardText", () => {
  it("separa linhas e colunas do Excel (TSV)", () => {
    expect(parseClipboardText("Código\tNome\r\n1\tEmpresa\r\n")).toEqual([
      ["Código", "Nome"],
      ["1", "Empresa"],
    ]);
  });
  it("respeita células entre aspas com quebra de linha e tab", () => {
    expect(parseClipboardText('a\t"x\ty"\n"l1\nl2"\tb')).toEqual([
      ["a", "x\ty"],
      ["l1\nl2", "b"],
    ]);
  });
});
