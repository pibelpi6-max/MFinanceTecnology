import "@testing-library/jest-dom/vitest";

// jsdom não implementa ResizeObserver (usado pelo DataTable para recalcular
// larguras de coluna). Mock mínimo suficiente para os testes.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}
