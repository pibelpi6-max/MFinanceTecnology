import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("cabeçalho e linhas têm o mesmo número de colunas", () => {
    renderGrid();
    const head = document.querySelectorAll("thead th").length;
    const colgroup = document.querySelectorAll("colgroup col").length;
    const cells = document.querySelectorAll("tbody tr:first-child td").length;
    expect(head).toBe(cells);
    expect(colgroup).toBe(cells);
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
    expect(screen.getByText(/1 de 4 linhas exibidas/)).toBeTruthy();
    expect(document.querySelectorAll("th button[aria-sort], th [aria-sort]").length).toBe(0);
  });
});

describe("ImportTreeGrid arrastar e soltar", () => {
  it("arrastar pela alça e soltar sobre outra linha move o item para dentro dela", async () => {
    const rows = applyBatchDependencies(buildAndValidateRows(sheet, mapping, fields), fields);
    const onMoveRow = vi.fn();
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <ImportTreeGrid rows={rows} fields={fields} onToggleSkip={() => {}} onEditRow={() => {}} onMoveRow={onMoveRow} counts={{ ready: 4, errors: 0, skipped: 0 }} />
      </NextIntlClientProvider>
    );
    const handles = screen.getAllByTitle(messages.import.review.dragHandle);
    const rowsEls = document.querySelectorAll("tbody tr");
    // jsdom não tem layout: o "ponto sob o cursor" é simulado
    let under: Element = rowsEls[1]; // Administrativo
    document.elementFromPoint = () => under;
    fireEvent.pointerDown(handles[2], { button: 0, clientX: 10, clientY: 10 }); // Comercial (1.2), 3ª linha na árvore
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 });
    expect(onMoveRow).toHaveBeenCalledWith(3, 1);
  });
});

describe("ImportTreeGrid padrão do desenhe-app", () => {
  it("busca filtra as linhas e 'limpar filtros' restaura", () => {
    renderGrid();
    fireEvent.change(screen.getByPlaceholderText("Buscar..."), { target: { value: "recursos" } });
    expect(screen.queryByText("Comercial")).toBeNull();
    expect(screen.getByText("Recursos Humanos")).toBeTruthy();
    fireEvent.click(screen.getByText("limpar filtros"));
    expect(screen.getByText("Comercial")).toBeTruthy();
  });

  it("botão X por linha exclui da importação e não há mais checkbox", () => {
    const rows = applyBatchDependencies(buildAndValidateRows(sheet, mapping, fields), fields);
    const onToggleSkip = vi.fn();
    render(
      <NextIntlClientProvider locale="pt-BR" messages={messages}>
        <ImportTreeGrid rows={rows} fields={fields} onToggleSkip={onToggleSkip} onEditRow={() => {}} onMoveRow={() => {}} counts={{ ready: 4, errors: 0, skipped: 0 }} />
      </NextIntlClientProvider>
    );
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    fireEvent.click(screen.getAllByTitle(messages.import.review.excludeRow)[0]);
    expect(onToggleSkip).toHaveBeenCalledTimes(1);
  });
});
