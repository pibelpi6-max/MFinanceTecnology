"use server";

import { askClaude, AnthropicNotConfiguredError } from "@/lib/ai/anthropic";
import { heuristicColumnMapping } from "./heuristicMapping";
import type { ColumnMapping, ImportFieldConfig } from "./types";

const CONFIDENCE_THRESHOLD = 0.6;
const SAMPLE_ROWS = 5;

/**
 * Mascara o valor de uma célula preservando só o "formato" (maiúscula,
 * minúscula, dígito, pontuação) — deixa a IA reconhecer padrões (ex.:
 * "999,99" parece um valor monetário; "99/9999" parece mês/ano) sem
 * nunca ver o dado real do tenant. Mesma técnica usada no motor de
 * importação do produto irmão "Desenho".
 */
function maskValue(raw: string): string {
  return raw.replace(/[A-ZÀ-Ú]/g, "X").replace(/[a-zà-ú]/g, "x").replace(/[0-9]/g, "9");
}

function buildPrompt(
  headers: string[],
  sampleRows: string[][],
  fields: ImportFieldConfig[]
): string {
  const fieldList = fields
    .map((f) => `- "${f.key}": ${f.label}${f.required ? " (obrigatório)" : ""}`)
    .join("\n");

  const maskedSample = sampleRows
    .map((row, i) => `Linha ${i + 1}: [${row.map(maskValue).join(" | ")}]`)
    .join("\n");

  return `Você está ajudando a mapear as colunas de uma planilha importada para os campos de um sistema de orçamento (FP&A).

Colunas da planilha (índice: nome): ${headers.map((h, i) => `${i}: "${h}"`).join(", ")}

Amostra de valores por linha (mascarados por privacidade — maiúscula vira X, minúscula vira x, dígito vira 9; a pontuação e o formato foram preservados para você inferir o tipo de dado):
${maskedSample}

Campos de destino disponíveis:
${fieldList}

Para cada coluna da planilha, diga a qual campo de destino ela corresponde (ou null se não corresponder a nenhum ou se os dados forem inconclusivos). Confie mais no FORMATO dos valores do que no nome da coluna — cabeçalhos de planilhas de terceiros costumam ser genéricos ou errados. Cada campo de destino só pode ser usado por UMA coluna. Seja conservador: use confidence abaixo de 0.5 sempre que o nome da coluna e os dados não concordarem claramente.

Responda APENAS com um JSON válido, neste formato exato, sem markdown, sem texto antes ou depois:
{"mapping":[{"columnIndex":0,"targetKey":"chave_do_campo_ou_null","confidence":0.0}]}`;
}

function parseAiResponse(text: string): { columnIndex: number; targetKey: string | null; confidence: number }[] {
  const cleaned = text.replace(/```json\s*|```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    mapping?: { columnIndex: number; targetKey: string | null; confidence: number }[];
  };
  if (!Array.isArray(parsed.mapping)) throw new Error("Resposta da IA sem campo 'mapping'.");
  return parsed.mapping;
}

/**
 * Sugere o mapeamento de colunas da planilha para os campos do layout.
 * Sempre calcula o mapeamento heurístico primeiro (grátis, sem IA) como
 * base e fallback; se a IA estiver configurada, refina com base numa
 * amostra mascarada. Qualquer falha da IA (rede, JSON inválido, chave
 * não configurada) nunca bloqueia o fluxo — cai de volta na heurística.
 */
export async function suggestColumnMapping(
  headers: string[],
  rows: string[][],
  fields: ImportFieldConfig[]
): Promise<ColumnMapping[]> {
  const heuristic = heuristicColumnMapping(headers, fields);

  try {
    const sampleRows = rows.slice(0, SAMPLE_ROWS);
    if (sampleRows.length === 0) return heuristic;

    const prompt = buildPrompt(headers, sampleRows, fields);
    const text = await askClaude({
      system:
        "Você é um assistente especialista em mapear colunas de planilhas importadas para campos de um sistema financeiro. Responda sempre em JSON puro, conforme solicitado.",
      userMessage: prompt,
      maxTokens: 1024,
    });
    const aiMapping = parseAiResponse(text);

    const claimed = new Set<string>();
    const validKeys = new Set(fields.map((f) => f.key));

    return heuristic.map((h) => {
      const ai = aiMapping.find((m) => m.columnIndex === h.columnIndex);
      if (
        ai &&
        ai.targetKey &&
        validKeys.has(ai.targetKey) &&
        ai.confidence >= CONFIDENCE_THRESHOLD &&
        !claimed.has(ai.targetKey)
      ) {
        claimed.add(ai.targetKey);
        return { columnIndex: h.columnIndex, targetKey: ai.targetKey, confidence: ai.confidence };
      }
      // fallback pra sugestão heurística desta coluna, se ainda disponível
      if (h.targetKey && !claimed.has(h.targetKey)) {
        claimed.add(h.targetKey);
        return h;
      }
      return { columnIndex: h.columnIndex, targetKey: null, confidence: 0 };
    });
  } catch (e) {
    if (!(e instanceof AnthropicNotConfiguredError)) {
      console.error("[suggestColumnMapping] IA indisponível, usando mapeamento heurístico:", e);
    }
    return heuristic;
  }
}
