import { BATCH_REF_PREFIX } from "./types";
import type { ColumnMapping, ImportCellSuggestion, ImportFieldConfig, ImportRowResult } from "./types";

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

export function normalizeMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function resolveNodeRef(
  raw: string,
  field: ImportFieldConfig,
  batchRefs: Set<string> | null,
  selfRaws: string[]
): { value: string; error: string | null; note?: ImportCellSuggestion } {
  const options = field.options ?? [];
  const trimmed = raw.trim();
  if (trimmed === "") return { value: "", error: null };

  const byCode = options.find((o) => o.code && normalizeMatch(o.code) === normalizeMatch(trimmed));
  if (byCode) return { value: byCode.value, error: null };

  const byName = options.find((o) => normalizeMatch(o.label) === normalizeMatch(trimmed));
  if (byName) return { value: byName.value, error: null };

  // Pai que está em outra linha da mesma planilha (hierarquia num arquivo só).
  if (batchRefs?.has(normalizeMatch(trimmed))) {
    if (selfRaws.some((r) => normalizeMatch(r) === normalizeMatch(trimmed))) {
      return { value: "", error: `"${trimmed}" não pode ser superior de si mesmo.` };
    }
    return { value: `${BATCH_REF_PREFIX}${trimmed}`, error: null };
  }

  const partial = options.filter((o) => normalizeMatch(o.label).includes(normalizeMatch(trimmed)));
  if (partial.length === 1) {
    const o = partial[0];
    return {
      value: o.value,
      error: null,
      note: { from: trimmed, to: o.label },
    };
  }
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
  fields: ImportFieldConfig[],
  /** linhas (por índice) desmarcadas na revisão — não contam como "raiz" nem entram na importação */
  skipped: ReadonlySet<number> = new Set()
): ImportRowResult[] {
  const columnByKey = new Map<string, number>();
  mapping.forEach((m) => {
    if (m.targetKey) columnByKey.set(m.targetKey, m.columnIndex);
  });

  // Para node-ref com batchRefKeys: conjunto (normalizado) de códigos/nomes
  // presentes nas linhas da própria planilha.
  const batchRefsByField = new Map<string, Set<string>>();
  for (const field of fields) {
    if (field.type !== "node-ref" || !field.batchRefKeys?.length) continue;
    const set = new Set<string>();
    for (const key of field.batchRefKeys) {
      const col = columnByKey.get(key);
      if (col === undefined) continue;
      for (const r of rows) {
        const v = (r[col] ?? "").trim();
        if (v) set.add(normalizeMatch(v));
      }
    }
    batchRefsByField.set(field.key, set);
  }

  let emptyRowsUsed = 0;

  return rows.map((row, rowIndex) => {
    const values: Record<string, string> = {};
    const rawValues: Record<string, string> = {};
    const errors: Record<string, string> = {};
    const notes: Record<string, ImportCellSuggestion> = {};

    for (const field of fields) {
      const columnIndex = columnByKey.get(field.key);
      const raw = columnIndex !== undefined ? (row[columnIndex] ?? "").trim() : "";
      rawValues[field.key] = raw;

      if (raw === "") {
        if (field.required) errors[field.key] = `${field.label} é obrigatório.`;
        else if (field.maxEmptyRows !== undefined) {
          // Só conta como raiz a linha que realmente tem dados (código/nome).
          const hasData = !skipped.has(rowIndex) && row.some((c) => (c ?? "").trim() !== "");
          if (hasData) {
            emptyRowsUsed += 1;
            if (emptyRowsUsed > field.maxEmptyRows) {
              errors[field.key] =
                field.emptyRowsLimitMessage ?? `${field.label} é obrigatório: só é permitido um item de nível 1 por estrutura.`;
            }
          }
        }
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
        const selfRaws = (field.batchRefKeys ?? []).map((k) => {
          const col = columnByKey.get(k);
          return col !== undefined ? (row[col] ?? "").trim() : "";
        });
        const { value, error, note } = resolveNodeRef(raw, field, batchRefsByField.get(field.key) ?? null, selfRaws);
        if (note) notes[field.key] = note;
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

    return { rowIndex, values, rawValues, errors, baseErrors: { ...errors }, notes: { ...notes }, baseNotes: { ...notes }, skip: skipped.has(rowIndex) };
  });
}

/** Linha da planilha que o `Item Superior` de `row` aponta (pai dentro do mesmo arquivo), se houver. */
export function findBatchProvider(
  rows: ImportRowResult[],
  fields: ImportFieldConfig[],
  row: ImportRowResult
): ImportRowResult | null {
  const refField = fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length);
  if (!refField) return null;
  const value = row.values[refField.key] ?? "";
  if (!value.startsWith(BATCH_REF_PREFIX)) return null;
  const ref = normalizeMatch(value.slice(BATCH_REF_PREFIX.length));
  const keys = refField.batchRefKeys ?? [];
  return (
    rows.find((p) => p.rowIndex !== row.rowIndex && keys.some((k) => normalizeMatch(p.rawValues[k] ?? "") === ref)) ??
    null
  );
}

/**
 * Regras que dependem de várias linhas da mesma planilha (hierarquia pai/
 * filho via batchRefKeys): código repetido; e uma linha só é importável se o
 * pai dela também for — não ignorado, sem erro e, por sua vez, resolvível até
 * uma raiz/item já existente. Reavaliada a cada edição ou marcar/desmarcar,
 * para que a revisão mostre ANTES de importar o que vai falhar e por quê.
 */
export function applyBatchDependencies(rows: ImportRowResult[], fields: ImportFieldConfig[]): ImportRowResult[] {
  const refField = fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length);
  if (!refField) return rows;
  const keys = refField.batchRefKeys ?? [];
  const codeKey = keys[0];

  // Código repetido entre linhas ativas (a 1ª ocorrência vale, as demais erram).
  const baseErrors = new Map<number, Record<string, string>>();
  const firstByCode = new Map<string, number>();
  for (const r of rows) {
    const eb = { ...r.baseErrors };
    const code = normalizeMatch(r.rawValues[codeKey] ?? "");
    if (!r.skip && code) {
      const first = firstByCode.get(code);
      if (first === undefined) firstByCode.set(code, r.rowIndex);
      else if (!eb[codeKey]) eb[codeKey] = `Código repetido: já usado na linha ${first + 1}. Troque o código.`;
    }
    baseErrors.set(r.rowIndex, eb);
  }

  const isBatch = (r: ImportRowResult) => (r.values[refField.key] ?? "").startsWith(BATCH_REF_PREFIX);
  const ready = (r: ImportRowResult) => !r.skip && Object.keys(baseErrors.get(r.rowIndex) ?? {}).length === 0;
  const identifies = (p: ImportRowResult, ref: string) => keys.some((k) => normalizeMatch(p.rawValues[k] ?? "") === ref);
  const refOf = (r: ImportRowResult) => normalizeMatch((r.values[refField.key] ?? "").slice(BATCH_REF_PREFIX.length));

  const resolvable = new Set<number>();
  rows.forEach((r) => {
    if (ready(r) && !isBatch(r)) resolvable.add(r.rowIndex);
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) {
      if (resolvable.has(r.rowIndex) || !ready(r) || !isBatch(r)) continue;
      const ref = refOf(r);
      if (rows.some((p) => p.rowIndex !== r.rowIndex && resolvable.has(p.rowIndex) && identifies(p, ref))) {
        resolvable.add(r.rowIndex);
        changed = true;
      }
    }
  }

  return rows.map((r) => {
    const errors = { ...(baseErrors.get(r.rowIndex) ?? {}) };
    const notes = { ...r.baseNotes };
    if (isBatch(r) && !errors[refField.key]) {
      const prov = findBatchProvider(rows, fields, r);
      const typed = (r.rawValues[refField.key] ?? "").trim();
      const provName = (prov?.rawValues[keys[1] ?? keys[0]] ?? "").trim();
      if (prov && provName && normalizeMatch(typed) !== normalizeMatch(provName)) {
        notes[refField.key] = { from: typed, to: provName };
      }
    }
    if (!r.skip && isBatch(r) && !errors[refField.key] && !resolvable.has(r.rowIndex)) {
      const ref = (r.values[refField.key] ?? "").slice(BATCH_REF_PREFIX.length);
      const provider = findBatchProvider(rows, fields, r);
      const n = provider ? provider.rowIndex + 1 : null;
      if (provider?.skip) {
        errors[refField.key] = `O item superior "${ref}" (linha ${n}) está desmarcado e não será importado. Marque a linha ${n} ou troque o Item Superior.`;
      } else if (provider && Object.keys(baseErrors.get(provider.rowIndex) ?? {}).length > 0) {
        errors[refField.key] = `O item superior "${ref}" (linha ${n}) tem erro e não será importado. Corrija a linha ${n} primeiro.`;
      } else if (provider) {
        errors[refField.key] = `Referência circular: "${ref}" (linha ${n}) depende, direta ou indiretamente, deste item. Ajuste o Item Superior.`;
      } else {
        errors[refField.key] = `O item superior "${ref}" não foi encontrado.`;
      }
    }
    return { ...r, errors, notes };
  });
}
