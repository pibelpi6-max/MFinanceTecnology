/** Separa nomes de produtos digitados/colados: uma linha por produto, ou
 * separados por vírgula, ponto e vírgula ou tab. Remove vazios e duplicados. */
export function parseProductNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n\r,;\t]+/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
