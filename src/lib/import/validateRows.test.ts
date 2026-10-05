import { describe, expect, it } from "vitest";
import { buildAndValidateRows } from "./validateRows";
import type { ColumnMapping, ImportFieldConfig } from "./types";

const fields: ImportFieldConfig[] = [
  { key: "nome", label: "Nome", type: "text", required: true },
  { key: "valor", label: "Valor", type: "number", required: true },
  {
    key: "centro_custo",
    label: "Centro de Custo",
    type: "node-ref",
    required: false,
    options: [
      { value: "id-1010", label: "Marketing", code: "1010" },
      { value: "id-2020", label: "Vendas", code: "2020" },
    ],
  },
];

const mapping: ColumnMapping[] = [
  { columnIndex: 0, targetKey: "nome" },
  { columnIndex: 1, targetKey: "valor" },
  { columnIndex: 2, targetKey: "centro_custo" },
];

describe("buildAndValidateRows", () => {
  it("aceita linha válida sem erros", () => {
    const [row] = buildAndValidateRows([["Aluguel", "1.234,56", "1010"]], mapping, fields);
    expect(row.errors).toEqual({});
    expect(row.values.valor).toBe("1234.56");
    expect(row.values.centro_custo).toBe("id-1010");
  });

  it("resolve node-ref por nome quando o código não bate", () => {
    const [row] = buildAndValidateRows([["Aluguel", "100", "Vendas"]], mapping, fields);
    expect(row.values.centro_custo).toBe("id-2020");
    expect(row.errors.centro_custo).toBeUndefined();
  });

  it("marca erro quando campo obrigatório está vazio", () => {
    const [row] = buildAndValidateRows([["", "100", ""]], mapping, fields);
    expect(row.errors.nome).toBeDefined();
  });

  it("marca erro quando número é inválido", () => {
    const [row] = buildAndValidateRows([["Aluguel", "abc", ""]], mapping, fields);
    expect(row.errors.valor).toBeDefined();
  });

  it("marca erro quando node-ref não é encontrado", () => {
    const [row] = buildAndValidateRows([["Aluguel", "100", "Inexistente"]], mapping, fields);
    expect(row.errors.centro_custo).toContain("não encontrado");
  });

  it("não bloqueia campo node-ref opcional vazio", () => {
    const [row] = buildAndValidateRows([["Aluguel", "100", ""]], mapping, fields);
    expect(row.errors.centro_custo).toBeUndefined();
  });

  it("valida todas as linhas de uma vez, sem parar na primeira com erro", () => {
    const rows = buildAndValidateRows(
      [
        ["", "100", ""],
        ["Ok", "abc", ""],
        ["Ok", "50", ""],
      ],
      mapping,
      fields
    );
    expect(Object.keys(rows[0].errors).length).toBeGreaterThan(0);
    expect(Object.keys(rows[1].errors).length).toBeGreaterThan(0);
    expect(Object.keys(rows[2].errors).length).toBe(0);
  });
});
