import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ColumnMappingFields } from "./ColumnMappingFields";
import type { ImportFieldConfig, ParsedSheet } from "@/lib/import/types";
import messages from "../../../messages/pt-BR.json";

const fields: ImportFieldConfig[] = [
  { key: "codigo", label: "Código", type: "text", required: true },
  { key: "nome", label: "Nome", type: "text", required: true },
];
const sheet = { headers: ["A", "B", "C"], rows: [["1", "x", "y"]] } as unknown as ParsedSheet;

describe("ColumnMappingFields", () => {
  it("campo já escolhido em outra coluna sai da lista, mas 'Ignorar' continua", () => {
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <ColumnMappingFields
          sheet={sheet}
          fields={fields}
          mapping={[{ columnIndex: 0, targetKey: "codigo" }]}
          onChange={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    const selects = screen.getAllByRole("combobox");
    const labels = (i: number) => Array.from(selects[i].querySelectorAll("option")).map((o) => o.textContent);
    expect(labels(0)).toContain("Código *"); // a própria coluna mantém o que escolheu
    expect(labels(1)).not.toContain("Código *"); // outras colunas não veem mais
    expect(labels(1)).toContain("Nome *");
    expect(labels(1)).toContain(messages.import.mapping.ignoreColumn);
    expect(labels(2)).toContain(messages.import.mapping.ignoreColumn);
  });
});
