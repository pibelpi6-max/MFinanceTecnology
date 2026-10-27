import { describe, expect, it } from "vitest";
import { parseErpCodes } from "./erpCodes";

describe("parseErpCodes", () => {
  it("separa por linha, vírgula, ponto e vírgula e tab", () => {
    expect(parseErpCodes("1001\n1002, 1003;1004\t1005")).toEqual(["1001", "1002", "1003", "1004", "1005"]);
  });
  it("remove vazios e duplicados", () => {
    expect(parseErpCodes(" A1 \n\n a1 ,B2")).toEqual(["A1", "B2"]);
  });
  it("mantém zeros à esquerda", () => {
    expect(parseErpCodes("000123")).toEqual(["000123"]);
  });
});
