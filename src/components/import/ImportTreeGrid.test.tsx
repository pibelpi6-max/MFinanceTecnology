import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ImportTreeGrid } from "./ImportTreeGrid";
import { applyBatchDependencies, buildAndValidateRows } from "@/lib/import/validateRows";
import type { ColumnMapping, ImportFieldConfig } from "@/lib/import/types";
import messages from "../../../messages/pt-BR.json";

vi.mock("@/components/ui/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const fields: ImportFieldConfig[] = [
  { key: "codigo", label: "Código", type: "text", required: true },
  { key: "nome", label: "Nome", type: "text", required: true },
  { key: "item_superior", label: "Item Superior", type: "node-ref", required: false, options: [], batchRefKeys: ["codigo", "nome"], maxEmptyRows: 1 },
];
const mapping: ColumnMapping[] = [
  { columnIndex: 0, targetKey: "codigo" },
  { columnIndex: 1, targetKey: "nome" },
  { columnIndex: 2, targetKey: "item_superior" },
];
const sheet = [
  ["1", "Empresa", ""],
  ["1.1", "Administrativo", "1"],
  ["1.1.1", "Recursos Humanos", "Admin"],
  ["1.2", "Comercial", "1"],
];

function renderGrid() {
  const rows = applyBatchDependencies(buildAndValidateRows(sheet, mapping, fields), fields);
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ImportTreeGrid rows={rows} fields={fields} onToggleSkip={() => {}} onEditRow={() => {}} onMoveRow={() => {}} counts={{ ready: 4, errors: 0, skipped: 0 }} />
    </NextIntlClientProvider>
  );
}

describe("ImportTreeGrid", () => {
  it("mostra Observações da AI no lugar de Item Superior, sem coluna #", () => {
    renderGrid();
    expect(screen.getByText("Observações da AI")).toBeTruthy();
    expect(screen.queryByText("Item Superior")).toBeNull();
    expect(screen.queryByText("#")).toBeNull();
  });

  it("só escreve observação quando precisa: código exato não gera aviso, texto não encontrado gera erro", () => {
    renderGrid();
    expect(screen.queryByText("Arquivo:")).toBeNull();
    expect(screen.getByText(/"Admin" não encontrado/)).toBeTruthy();
  });

  it("recolhe e expande pelo +/−", () => {
    renderGrid();
    expect(screen.getByText("Comercial")).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText(/^Recolher: Empresa/)[0]);
    expect(screen.queryByText("Comercial")).toBeNull();
    fireEvent.click(screen.getAllByLabelText(/^Expandir: Empresa/)[0]);
    expect(screen.getByText("Comercial")).toBeTruthy();
  });

  it("filtra por coluna e não tem ordenação", () => {
    renderGrid();
    fireEvent.click(screen.getByLabelText("Filtrar Nome"));
    fireEvent.click(screen.getByText("Comercial", { selector: "span.block" }));
    fireEvent.click(screen.getByText("Aplicar"));
    expect(screen.queryByText("Administrativo")).toBeNull();
    expect(screen.getByText(/Mostrando 1 de 4 linhas/)).toBeTruthy();
    expect(document.querySelectorAll("th button[aria-sort], th [aria-sort]").length).toBe(0);
  });
});
