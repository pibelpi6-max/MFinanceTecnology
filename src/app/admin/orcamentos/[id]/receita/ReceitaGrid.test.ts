import { describe, it, expect } from "vitest";
import { cleanPasted } from "./ReceitaGrid";

describe("cleanPasted", () => {
  it("aceita formatos do Excel", () => {
    expect(cleanPasted("1.234,50")).toBe("1234,50");
    expect(cleanPasted("1.234")).toBe("1234");
    expect(cleanPasted("12.5")).toBe("12.5");
    expect(cleanPasted(" R$ 10,5 ")).toBe("10,5");
    expect(cleanPasted("")).toBe("");
  });
  it("rejeita texto e negativos", () => {
    expect(cleanPasted("abc")).toBeNull();
    expect(cleanPasted("-5")).toBeNull();
  });
});
