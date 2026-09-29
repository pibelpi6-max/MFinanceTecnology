import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renderiza o texto informado", () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByText("Salvar")).toBeInTheDocument();
  });

  it("chama onClick ao clicar", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    fireEvent.click(screen.getByText("Salvar"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
