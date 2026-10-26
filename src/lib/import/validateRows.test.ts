import { describe, expect, it } from "vitest";
import { applyBatchDependencies, buildAndValidateRows } from "./validateRows";
import { setCellValue } from "./editRows";
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

describe("buildAndValidateRows — pai na mesma planilha (batchRefKeys)", () => {
  const hierFields: ImportFieldConfig[] = [
    { key: "codigo", label: "Código", type: "text", required: true },
    { key: "nome", label: "Nome", type: "text", required: true },
    {
      key: "item_superior",
      label: "Item Superior",
      type: "node-ref",
      required: false,
      options: [{ value: "id-existente", label: "Existente", code: "9" }],
      batchRefKeys: ["codigo", "nome"],
    },
  ];
  const hierMapping: ColumnMapping[] = [
    { columnIndex: 0, targetKey: "codigo" },
    { columnIndex: 1, targetKey: "nome" },
    { columnIndex: 2, targetKey: "item_superior" },
  ];

  it("aceita pai (por código ou nome) que está em outra linha do arquivo", () => {
    const rows = buildAndValidateRows(
      [
        ["1", "Administrativo", ""],
        ["1.1", "RH", "1"],
        ["1.2", "Financeiro", "administrativo"],
        ["1.1.1", "Folha", "1.1"],
      ],
      hierMapping,
      hierFields
    );
    expect(rows.every((r) => Object.keys(r.errors).length === 0)).toBe(true);
    expect(rows[1].values.item_superior).toBe("@batch:1");
    expect(rows[2].values.item_superior).toBe("@batch:administrativo");
  });

  it("prefere pai já existente e ainda acusa pai inexistente ou autorreferência", () => {
    const rows = buildAndValidateRows(
      [
        ["5", "A", "9"],
        ["6", "B", "99"],
        ["7", "C", "7"],
      ],
      hierMapping,
      hierFields
    );
    expect(rows[0].values.item_superior).toBe("id-existente");
    expect(rows[1].errors.item_superior).toBeDefined();
    expect(rows[2].errors.item_superior).toBeDefined();
  });
});

describe("buildAndValidateRows — um único item raiz (maxEmptyRows)", () => {
  const f: ImportFieldConfig[] = [
    { key: "codigo", label: "Código", type: "text", required: true },
    { key: "nome", label: "Nome", type: "text", required: true },
    { key: "item_superior", label: "Item Superior", type: "node-ref", required: false, options: [], batchRefKeys: ["codigo", "nome"], maxEmptyRows: 1 },
  ];
  const m: ColumnMapping[] = [
    { columnIndex: 0, targetKey: "codigo" },
    { columnIndex: 1, targetKey: "nome" },
    { columnIndex: 2, targetKey: "item_superior" },
  ];

  it("aceita uma raiz e acusa a segunda", () => {
    const rows = buildAndValidateRows([["1", "Empresa", ""], ["2", "Outra", ""], ["1.1", "RH", "1"]], m, f);
    expect(rows[0].errors.item_superior).toBeUndefined();
    expect(rows[1].errors.item_superior).toBeDefined();
    expect(rows[2].errors.item_superior).toBeUndefined();
  });
});

describe("applyBatchDependencies — filho cujo pai não será importado", () => {
  const f: ImportFieldConfig[] = [
    { key: "codigo", label: "Código", type: "text", required: true },
    { key: "nome", label: "Nome", type: "text", required: true },
    { key: "item_superior", label: "Item Superior", type: "node-ref", required: false, options: [], batchRefKeys: ["codigo", "nome"], maxEmptyRows: 1 },
  ];
  const m: ColumnMapping[] = [
    { columnIndex: 0, targetKey: "codigo" },
    { columnIndex: 1, targetKey: "nome" },
    { columnIndex: 2, targetKey: "item_superior" },
  ];
  const build = () =>
    buildAndValidateRows([["1", "Empresa", ""], ["1.1", "Adm", "1"], ["1.1.1", "RH", "1.1"]], m, f);

  it("tudo ok quando a cadeia inteira está marcada", () => {
    const rows = applyBatchDependencies(build(), f);
    expect(rows.every((r) => Object.keys(r.errors).length === 0)).toBe(true);
  });

  it("desmarcar a raiz derruba os descendentes com mensagem clara, e remarcar volta", () => {
    const rows = build();
    rows[0].skip = true;
    const off = applyBatchDependencies(rows, f);
    expect(off[1].errors.item_superior).toMatch(/desmarcado/);
    expect(off[2].errors.item_superior).toMatch(/linha 2/);
    rows[0].skip = false;
    const on = applyBatchDependencies(rows, f);
    expect(on.every((r) => Object.keys(r.errors).length === 0)).toBe(true);
  });

  it("detecta referência circular", () => {
    const rows = applyBatchDependencies(buildAndValidateRows([["A", "a", "B"], ["B", "b", "A"]], m, f), f);
    expect(rows[0].errors.item_superior).toMatch(/circular/);
  });
});

describe("avisos de interpretação (notes)", () => {
  const f: ImportFieldConfig[] = [
    { key: "codigo", label: "Código", type: "text", required: true },
    { key: "nome", label: "Nome", type: "text", required: true },
    { key: "item_superior", label: "Item Superior", type: "node-ref", required: false,
      options: [{ value: "id-adm", label: "Administrativo", code: "10" }], batchRefKeys: ["codigo", "nome"] },
  ];
  const m: ColumnMapping[] = [
    { columnIndex: 0, targetKey: "codigo" },
    { columnIndex: 1, targetKey: "nome" },
    { columnIndex: 2, targetKey: "item_superior" },
  ];

  it("sugere de/para quando o texto digitado difere do item encontrado", () => {
    const rows = applyBatchDependencies(
      buildAndValidateRows([["20", "A", "Admin"], ["30", "B", "20"]], m, f),
      f
    );
    expect(rows[0].notes.item_superior).toEqual({ from: "Admin", to: "10 - Administrativo" });
    // "20" é o código exato do item achado: não é sugestão, só confirmação.
    expect(rows[1].notes.item_superior).toBeUndefined();
  });

  it("não avisa quando o casamento é exato", () => {
    const rows = buildAndValidateRows([["20", "A", "10"]], m, f);
    expect(rows[0].notes.item_superior).toBeUndefined();
  });
});

describe("código repetido, linha desmarcada e edição de célula", () => {
  const f: ImportFieldConfig[] = [
    { key: "codigo", label: "Código", type: "text", required: true },
    { key: "nome", label: "Nome", type: "text", required: true },
    { key: "item_superior", label: "Item Superior", type: "node-ref", required: false, options: [], batchRefKeys: ["codigo", "nome"], maxEmptyRows: 1 },
  ];
  const m: ColumnMapping[] = [
    { columnIndex: 0, targetKey: "codigo" },
    { columnIndex: 1, targetKey: "nome" },
    { columnIndex: 2, targetKey: "item_superior" },
  ];

  it("acusa código repetido na segunda ocorrência", () => {
    const rows = applyBatchDependencies(buildAndValidateRows([["1", "A", ""], ["1.1", "B", "1"], ["1.1", "C", "1"]], m, f), f);
    expect(rows[1].errors.codigo).toBeUndefined();
    expect(rows[2].errors.codigo).toMatch(/repetido/);
  });

  it("desmarcar uma das duas raízes libera a outra", () => {
    const data = [["1", "A", ""], ["2", "B", ""]];
    expect(buildAndValidateRows(data, m, f)[1].errors.item_superior).toBeDefined();
    const rows = buildAndValidateRows(data, m, f, new Set([0]));
    expect(rows[0].skip).toBe(true);
    expect(rows[1].errors.item_superior).toBeUndefined();
  });

  it("setCellValue acompanha a troca de código nos filhos e cria coluna que faltava", () => {
    const sheet = { headers: ["Código", "Nome"], rows: [["1", "Empresa"], ["1.1", "Adm"]], fileName: "x" };
    const base: ColumnMapping[] = [{ columnIndex: 0, targetKey: "codigo" }, { columnIndex: 1, targetKey: "nome" }];
    const withParent = setCellValue(sheet, base, f, 1, "item_superior", "1");
    expect(withParent.sheet.headers).toEqual(["Código", "Nome", "Item Superior"]);
    const renamed = setCellValue(withParent.sheet, withParent.mapping, f, 0, "codigo", "EMP");
    expect(renamed.sheet.rows[1][2]).toBe("EMP");
    const rows = applyBatchDependencies(buildAndValidateRows(renamed.sheet.rows, renamed.mapping, f), f);
    expect(rows.every((r) => Object.keys(r.errors).length === 0)).toBe(true);
  });
});
