import { normalizeMatch } from "./validateRows";
import type { ColumnMapping, ImportFieldConfig, ParsedSheet } from "./types";

/**
 * Edita uma célula da planilha já lida (tela de revisão). Se o campo ainda
 * não tinha coluna (ex.: planilha sem "Item Superior"), cria uma. Ao trocar
 * o código/nome de um item que outras linhas usam como pai (batchRefKeys),
 * acompanha a troca nessas linhas — senão renomear um pai quebraria os filhos.
 */
export function setCellValue(
  sheet: ParsedSheet,
  mapping: ColumnMapping[],
  fields: ImportFieldConfig[],
  rowIndex: number,
  key: string,
  value: string
): { sheet: ParsedSheet; mapping: ColumnMapping[] } {
  const headers = [...sheet.headers];
  let rows = sheet.rows.map((r) => [...r]);
  const map = [...mapping];

  const ensure = (k: string): number => {
    const existing = map.find((m) => m.targetKey === k);
    if (existing) return existing.columnIndex;
    const idx = headers.length;
    headers.push(fields.find((f) => f.key === k)?.label ?? k);
    rows = rows.map((r) => [...r, ""]);
    map.push({ columnIndex: idx, targetKey: k, confidence: 1 });
    return idx;
  };

  const col = ensure(key);
  const old = rows[rowIndex][col] ?? "";
  rows[rowIndex][col] = value;

  const refField = fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length);
  if (refField?.batchRefKeys?.includes(key) && old.trim() && normalizeMatch(old) !== normalizeMatch(value)) {
    const refCol = ensure(refField.key);
    rows.forEach((r, i) => {
      if (i !== rowIndex && normalizeMatch(r[refCol] ?? "") === normalizeMatch(old)) r[refCol] = value;
    });
  }

  return { sheet: { ...sheet, headers, rows }, mapping: map };
}
