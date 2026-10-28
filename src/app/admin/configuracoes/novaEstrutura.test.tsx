import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/pt-BR.json";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/_actions/userPreferences", () => ({ saveUserPreference: vi.fn(), getUserPreference: vi.fn().mockResolvedValue(null) }));
vi.mock("./_structureActions", () => ({
  createDimensionStructure: vi.fn().mockResolvedValue({ success: true, id: "s2" }),
  renameDimensionStructure: vi.fn(),
  setDimensionStructureActive: vi.fn(),
  deleteDimensionStructure: vi.fn(),
  duplicateDimensionStructure: vi.fn(),
}));
vi.mock("../dimensoes/_actions", () => ({
  createDimensionNode: vi.fn().mockResolvedValue({ success: true, id: "n1" }),
  updateDimensionNode: vi.fn(),
  cancelDimensionNode: vi.fn(),
}));
vi.mock("./_actions", () => ({ deleteDimensionType: vi.fn(), updateFiscalYearStartMonth: vi.fn() }));
vi.mock("./_codeActions", () => ({}));
vi.mock("./ImportStructureModal", () => ({ ImportStructureModal: () => null }));
vi.mock("./ErpCodesModal", () => ({ ErpCodesModal: () => null }));
vi.mock("./ConjuntoFormModal", () => ({ ConjuntoFormModal: () => null }));
vi.mock("./DimensionTypeFormModal", () => ({ DimensionTypeFormModal: () => null }));
vi.mock("./_conjuntoActions", () => ({ deleteConjunto: vi.fn() }));

const type = { id: "t1", tenant_id: "x", code: "conta", name: "Conta", description: null, is_system: true, sort_order: 1, use_in_matriz: false };
const base = { dimensionTypes: [type], year: 2026, fiscalYearStartMonth: 1, isAdmin: true, conjuntos: [], erpCodesByNode: {} };

function ui(structures: unknown[], nodes: Record<string, unknown[]>) {
  return (
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ConfiguracoesClient {...(base as never)} structuresByType={{ t1: structures } as never} nodesByStructure={nodes as never} />
    </NextIntlClientProvider>
  );
}

describe("estrutura nova", () => {
  it("abre o item criado em edição", async () => {
    const { rerender } = render(ui([], {}));
    fireEvent.click((await screen.findAllByText("Estruturas")).pop()!);
    fireEvent.click(await screen.findByText("Nova estrutura"));
    const input = (await screen.findAllByRole("textbox")).find((e) => e.hasAttribute("required"))!;
    fireEvent.change(input, { target: { value: "Minha estrutura" } });
    fireEvent.submit(input.closest("form")!);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const s2 = { id: "s2", tenant_id: "x", dimension_type_id: "t1", name: "Minha estrutura", is_active: false, sort_order: 1 };
    const n1 = { id: "n1", versionId: "v1", code: "item-1", name: "Novo item", parentNodeId: null, level: 1, validFromYear: 2026, validUntilYear: null };
    rerender(ui([s2], { s2: [n1] }));
    await waitFor(() => expect(screen.getByDisplayValue("Novo item")).toBeInTheDocument());
  });
});
