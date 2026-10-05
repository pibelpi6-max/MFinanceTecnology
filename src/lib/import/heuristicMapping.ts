import type { ColumnMapping, ImportFieldConfig } from "./types";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Similaridade simples baseada em sobreposição de tokens — suficiente
 * para casar "Centro de Custo" com "centro_custo" ou "cost center",
 * sem precisar de uma lib de distância de edição.
 */
function similarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalize(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  tokensA.forEach((t) => {
    if (tokensB.has(t)) overlap++;
  });
  return overlap / Math.max(tokensA.size, tokensB.size);
}

const ACCEPT_THRESHOLD = 0.6;

/**
 * Mapeamento gratuito (sem IA), por similaridade de texto entre o
 * cabeçalho da planilha e o nome/aliases de cada campo do layout.
 * Sempre calculado primeiro — serve de base e de fallback caso a IA
 * falhe ou não esteja habilitada.
 */
export function heuristicColumnMapping(
  headers: string[],
  fields: ImportFieldConfig[]
): ColumnMapping[] {
  const claimed = new Set<string>();

  return headers.map((header, columnIndex) => {
    let bestKey: string | null = null;
    let bestScore = 0;

    for (const field of fields) {
      if (claimed.has(field.key)) continue;
      const candidates = [field.label, field.key, ...(field.aliases ?? [])];
      const score = Math.max(...candidates.map((c) => similarity(header, c)));
      if (score > bestScore) {
        bestScore = score;
        bestKey = field.key;
      }
    }

    if (bestKey && bestScore >= ACCEPT_THRESHOLD) {
      claimed.add(bestKey);
      return { columnIndex, targetKey: bestKey, confidence: bestScore };
    }
    return { columnIndex, targetKey: null, confidence: 0 };
  });
}
