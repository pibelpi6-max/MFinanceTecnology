import { describe, expect, it } from "vitest";
import { cleanName, nameKey, prepareProducts, titleCasePt, type ExistingProduct } from "./cleanProducts";

const ex = (id: string, code: string, name: string): ExistingProduct => ({ id, code, name, isLeaf: true, depth: 1 });

describe("higienização", () => {
  it("tira espaços em excesso", () => {
    expect(cleanName("  Café   em grãos  ")).toBe("Café em grãos");
  });
  it("compara sem acento e sem diferença de maiúsculas", () => {
    expect(nameKey("CAFÉ  Torrado")).toBe(nameKey("cafe torrado"));
  });
  it("title case em português", () => {
    expect(titleCasePt("CAFÉ EM GRÃOS DA FAZENDA")).toBe("Café em Grãos da Fazenda");
  });
});

describe("prepareProducts", () => {
  it("remove duplicados do arquivo (acento/maiúscula/espaço) e sugere códigos", () => {
    const r = prepareProducts([{ name: "Café" }, { name: " cafe " }, { name: "Chá" }], []);
    expect(r.map((x) => x.status)).toEqual(["new", "dup-file", "new"]);
    expect(r.filter((x) => x.status === "new").map((x) => x.code)).toEqual(["P001", "P002"]);
    expect(r[0].codeIsAuto).toBe(true);
  });
  it("marca já existente por nome, ignorando acento", () => {
    const r = prepareProducts([{ name: "CAFE" }], [ex("1", "P001", "Café")]);
    expect(r[0].status).toBe("exists");
  });
  it("sugestão de código continua depois do maior existente e foge dos informados", () => {
    const r = prepareProducts([{ name: "A" }, { name: "B", code: "P004" }, { name: "C" }], [ex("1", "P002", "X")]);
    expect(r.map((x) => x.code)).toEqual(["P003", "P004", "P005"]);
  });
  it("mesmo código com nome diferente atualiza o produto", () => {
    const r = prepareProducts([{ name: "Café Torrado", code: "100" }], [ex("1", "100", "Cafe")]);
    expect(r[0].status).toBe("update");
    expect(r[0].existingId).toBe("1");
  });
  it("código repetido no arquivo é sinalizado", () => {
    const r = prepareProducts([{ name: "A", code: "1" }, { name: "B", code: "1" }], []);
    expect(r.map((x) => x.status)).toEqual(["new", "dup-code"]);
  });
  it("edição manual do código vale na reclassificação", () => {
    const r = prepareProducts([{ name: "A" }, { name: "B" }], [], { codeOverrides: { 1: "ZZ" } });
    expect(r[1].code).toBe("ZZ");
    expect(r[1].codeIsAuto).toBe(false);
  });
  it("sem nome é ignorado", () => {
    expect(prepareProducts([{ name: "   " }], [])[0].status).toBe("empty");
  });
});
