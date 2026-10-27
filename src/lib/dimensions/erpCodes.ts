/** Normaliza uma lista digitada/colada de códigos do ERP: separa por quebra
 * de linha, vírgula, ponto e vírgula ou tab; apara espaços; remove vazios e
 * duplicados (sem diferenciar maiúsculas/minúsculas). */
export function parseErpCodes(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n\r,;\t]+/)) {
    const code = part.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}
