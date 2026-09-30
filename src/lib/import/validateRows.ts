import type { ColumnMapping, ImportFieldConfig, ImportRowResult } from "./types";

/** Converte texto em número aceitando formato BR ("1.234,56") e US ("1234.56"). */
function parseNumberBR(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let normalized = trimmed;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    // formato BR: ponto é milhar, vírgula é decimal
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function normalizeMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function resolveNodeRef(raw: string, field: ImportFieldConfig): { value: string; error: string | null } {
  const options = field.options ?? [];
  const trimmed = raw.trim();
  if (trimmed === "") return { value: "", error: null };

  const byCode = options.find((o) => o.code && normalizeMatch(o.code) === normalizeMatch(trimmed));
  if (byCode) return { value: byCode.value, error: null };

  const byName = options.find((o) => normalizeMatch(o.label) === normalizeMatch(trimmed));
  if (byName) return { value: byName.value, error: null };

  const partial = options.filter((o) => normalizeMatch(o.label).includes(normalizeMatch(trimmed)));
  if (partial.length === 1) return { value: partial[0].value, error: null };
  if (partial.length > 1) return { value: "", error: `"${trimmed}" é ambíguo — use o código exato.` };

  return { value: "", error: `"${trimmed}" não encontrado em ${field.label}.` };
}

/**
 * Monta e valida todas as linhas de uma vez (não para na primeira
 * linha com erro) — o usuário revisa e corrige tudo numa única
 * passada em vez de um loop frustrante linha a linha.
 */
export function buildAndValidateRows(
  rows: string[][],
  mapping: ColumnMapping[],
  fields: ImportFieldConfig[]
): ImportRowResult[] {
  const columnByKey = new Map<string, number>();
  mapping.forEach((m) => {
    if (m.targetKey) columnByKey.set(m.targetKey, m.columnIndex);
  });

  return rows.map((row, rowIndex) => {
    const values: Record<string, string> = {};
    const rawValues: Record<string, string> = {};
    const errors: Record<string, string> = {};

    for (const field of fields) {
      const columnIndex = columnByKey.get(field.key);
      const raw = columnIndex !== undefined ? (row[columnIndex] ?? "").trim() : "";
      rawValues[field.key] = raw;

      if (raw === "") {
        if (field.required) errors[field.key] = `${field.label} é obrigatório.`;
        values[field.key] = "";
        continue;
      }

      if (field.type === "number") {
        const parsed = parseNumberBR(raw);
        if (parsed === null) {
          errors[field.key] = `"${raw}" não é um número válido.`;
          values[field.key] = raw;
        } else {
          values[field.key] = String(parsed);
        }
      } else if (field.type === "node-ref") {
        const { value, error } = resolveNodeRef(raw, field);
        values[field.key] = value;
        if (error) errors[field.key] = error;
      } else {
        values[field.key] = raw;
      }

      if (!errors[field.key] && field.validateExtra) {
        const extraError = field.validateExtra(values[field.key]);
        if (extraError) errors[field.key] = extraError;
      }
    }

    return { rowIndex, values, rawValues, errors, skip: false };
  });
}
