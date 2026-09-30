import { describe, expect, it } from "vitest";
import { heuristicColumnMapping } from "./heuristicMapping";
import type { ImportFieldConfig } from "./types";

const fields: ImportFieldConfig[] = [
  { key: "codigo", label: "Código", type: "text", required: true, aliases: ["codigo", "code"] },
  { key: "nome", label: "Nome", type: "text", required: true, aliases: ["nome", "name"] },
  { key: "centro_custo", label: "Centro de Custo", type: "node-ref", required: true, aliases: ["cost center", "cc"] },
];

describe("heuristicColumnMapping", () => {
  it("mapeia cabeçalhos que batem exatamente com o rótulo do campo", () => {
    const result = heuristicColumnMapping(["Código", "Nome"], fields);
    expect(result[0].targetKey).toBe("codigo");
    expect(result[1].targetKey).toBe("nome");
  });

  it("mapeia por alias quando o cabeçalho não bate com o rótulo", () => {
    const result = heuristicColumnMapping(["Cost Center"], fields);
    expect(result[0].targetKey).toBe("centro_custo");
  });

  it("não mapeia coluna sem correspondência razoável", () => {
    const result = heuristicColumnMapping(["Telefone do Cliente"], fields);
    expect(result[0].targetKey).toBeNull();
  });

  it("nunca atribui o mesmo campo de destino a duas colunas", () => {
    const result = heuristicColumnMapping(["Nome", "Nome Completo"], fields);
    const claimed = result.map((r) => r.targetKey).filter(Boolean);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
