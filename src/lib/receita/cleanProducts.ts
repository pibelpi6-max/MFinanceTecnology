/**
 * Higienização e classificação de produtos para importação em massa.
 * Funções puras (sem I/O) — a tela mostra o resultado numa prévia e só então grava.
 */

/** Tira espaços nas pontas e repetidos no meio (inclui espaço não separável e tabs). */
export function cleanName(raw: string): string {
  return raw.normalize("NFC").replace(/[\s ]+/g, " ").trim();
}

/** Chave de comparação: sem acento, sem diferença de maiúsculas e sem espaços repetidos. */
export function nameKey(raw: string): string {
  return cleanName(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Código: sem espaços nas pontas; comparação sem diferença de maiúsculas. */
export function cleanCode(raw: string): string {
  return raw.replace(/[\s ]+/g, " ").trim();
}
export const codeKey = (raw: string) => cleanCode(raw).toLowerCase();

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o", "no", "na", "nos", "nas", "por"]);

/** "CAFÉ EM GRÃOS" → "Café em Grãos". Palavras com número/sigla curta mantidas. */
export function titleCasePt(name: string): string {
  return cleanName(name)
    .split(" ")
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      if (/\d/.test(w)) return w.toUpperCase() === w ? w : w;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export interface ExistingProduct {
  id: string;
  code: string;
  name: string;
  isLeaf: boolean;
  depth: number;
}

export interface ProductInput {
  name: string;
  code?: string;
  group?: string;
}

export type ProductStatus =
  | "new" // será criado
  | "update" // mesmo código de um produto existente com nome diferente: renomeia
  | "exists" // já cadastrado (igual): ignorado
  | "dup-file" // repetido dentro do arquivo: ignorado
  | "dup-code" // código repetido no arquivo ou já usado por outro produto
  | "empty"; // sem nome

export interface PreparedProduct {
  index: number;
  rawName: string;
  name: string;
  /** Nome foi ajustado (espaços/maiúsculas) em relação ao original. */
  adjusted: boolean;
  code: string;
  /** Código sugerido pelo sistema (a pessoa não informou). */
  codeIsAuto: boolean;
  group: string;
  status: ProductStatus;
  /** Produto existente alvo (update/exists). */
  existingId?: string;
}

export interface PrepareOptions {
  titleCase?: boolean;
  /** Edições manuais do código na prévia: índice da linha → código. */
  codeOverrides?: Record<number, string>;
  /** Prefixo e largura dos códigos sugeridos (P001, P002...). */
  autoPrefix?: string;
}

export function prepareProducts(inputs: ProductInput[], existing: ExistingProduct[], opts: PrepareOptions = {}): PreparedProduct[] {
  const prefix = opts.autoPrefix ?? "P";
  const byCode = new Map(existing.map((e) => [codeKey(e.code), e]));
  const byName = new Map<string, ExistingProduct>();
  for (const e of existing) if (!byName.has(nameKey(e.name))) byName.set(nameKey(e.name), e);

  // Códigos já tomados (existentes + informados no arquivo) — a sugestão automática foge deles.
  const taken = new Set(existing.map((e) => codeKey(e.code)));
  const explicit = inputs.map((r, i) => {
    const o = opts.codeOverrides?.[i];
    return cleanCode(o !== undefined ? o : r.code ?? "");
  });
  explicit.forEach((c) => c && taken.add(codeKey(c)));
  const maxExisting = existing.map((e) => codeKey(e.code))
    .map((c) => new RegExp(`^${prefix.toLowerCase()}(\\d+)$`).exec(c))
    .filter(Boolean)
    .map((m) => Number(m![1]));
  let counter = maxExisting.length ? Math.max(...maxExisting) : 0;
  const nextAuto = () => {
    let c: string;
    do c = `${prefix}${String(++counter).padStart(3, "0")}`;
    while (taken.has(c.toLowerCase()));
    taken.add(c.toLowerCase());
    return c;
  };

  const seenNames = new Set<string>();
  const seenCodes = new Set<string>();
  return inputs.map((r, index) => {
    const rawName = r.name ?? "";
    const cleaned = opts.titleCase ? titleCasePt(rawName) : cleanName(rawName);
    const base: PreparedProduct = {
      index, rawName, name: cleaned, adjusted: cleaned !== rawName, code: explicit[index], codeIsAuto: false,
      group: cleanName(r.group ?? ""), status: "new",
    };
    if (!cleaned) return { ...base, status: "empty" as const, adjusted: false };

    if (base.code) {
      const ck = codeKey(base.code);
      const ex = byCode.get(ck);
      if (seenCodes.has(ck)) return { ...base, status: "dup-code" as const };
      seenCodes.add(ck);
      seenNames.add(nameKey(cleaned));
      if (ex) {
        return nameKey(ex.name) === nameKey(cleaned)
          ? { ...base, status: "exists" as const, existingId: ex.id }
          : { ...base, status: "update" as const, existingId: ex.id };
      }
      return base;
    }

    const nk = nameKey(cleaned);
    if (seenNames.has(nk)) return { ...base, status: "dup-file" as const };
    seenNames.add(nk);
    const ex = byName.get(nk);
    if (ex) return { ...base, code: ex.code, status: "exists" as const, existingId: ex.id };
    return { ...base, code: nextAuto(), codeIsAuto: true };
  });
}
