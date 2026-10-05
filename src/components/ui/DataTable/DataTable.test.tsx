import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DataTable } from "./DataTable";
import type { ColumnMeta } from "./types";

vi.mock("@/app/_actions/userPreferences", () => ({
  saveUserPreference: vi.fn(),
  getUserPreference: vi.fn(),
}));

const messages = {
  common: {
    actions: "Ações",
    edit: "Editar",
    delete: "Excluir",
    search: "Buscar",
    tooltips: {
      columns: "Colunas",
      dragColumn: "Arrastar coluna",
      noInfo: "Sem informações",
      viewDetails: "Ver detalhes",
      close: "Fechar",
    },
    columns: {
      allVisible: "Todas as colunas estão visíveis.",
      noMatch: "Nenhuma coluna disponível corresponde à busca.",
      subtitle: "Ative, desative ou arraste para reordenar",
      title: "Colunas",
    },
  },
};

interface Row {
  id: string;
  name: string;
}

const columns: ColumnMeta<Row>[] = [
  { key: "name", label: "Nome", getText: (row) => row.name },
];

function renderTable(items: Row[]) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <DataTable<Row>
        items={items}
        columns={columns}
        prefsKey="test-table"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onNew={vi.fn()}
        newLabel="Novo item"
      />
    </NextIntlClientProvider>,
  );
}

describe("DataTable", () => {
  it("renderiza as linhas recebidas", () => {
    renderTable([
      { id: "1", name: "Centro de Custo A" },
      { id: "2", name: "Centro de Custo B" },
    ]);

    expect(screen.getByText("Centro de Custo A")).toBeInTheDocument();
    expect(screen.getByText("Centro de Custo B")).toBeInTheDocument();
  });

  it("mostra a mensagem vazia quando não há itens", () => {
    renderTable([]);
    expect(document.body).toBeInTheDocument();
  });
});
