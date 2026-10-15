// Motor genérico de "Importação assistida por IA" — reaproveitado pelas
// telas de Dimensões, Matriz/Diretriz Orçamentária, Realizado e Pacotes.
// Inspirado no motor equivalente do produto irmão "Desenho"
// (src/lib/import/* em pibelpi6-max/desenhe-app): cada tela só precisa
// declarar um ImportLayoutConfig (campos) e uma Server Action de
// importação linha a linha — o parsing, o mapeamento de colunas (com ou
// sem IA), a validação e a UI do assistente (ImportWizard) são únicos.

export type ImportFieldType = "text" | "number" | "node-ref";

export interface ImportFieldOption {
  /** id/valor final que a linha vai carregar quando o campo for resolvido */
  value: string;
  /** rótulo mostrado ao usuário (ex.: "1010 — Salários") */
  label: string;
  /** código curto usado para bater com a planilha, quando existir (node-ref) */
  code?: string;
}

export interface ImportFieldConfig {
  key: string;
  label: string;
  type: ImportFieldType;
  required: boolean;
  /** variações de nome de coluna que ajudam o mapeamento heurístico/IA a reconhecer este campo */
  aliases?: string[];
  /** obrigatório para type "node-ref": as opções válidas (id + código + nome) para resolver o texto da célula */
  options?: ImportFieldOption[];
  /** texto de ajuda mostrado na etapa de mapeamento */
  helpText?: string;
  /**
   * node-ref que também pode apontar para OUTRA LINHA da própria planilha
   * (hierarquia pai/filho subida de uma vez só). Lista as chaves de campo
   * cujo valor identifica uma linha (ex.: ["codigo", "nome"]). Quando o texto
   * não bate com nenhuma opção já existente mas bate com uma dessas colunas
   * em outra linha, o valor resolvido vira `@batch:<texto>` e a Server Action
   * resolve a ordem de criação (ver BATCH_REF_PREFIX).
   */
  batchRefKeys?: string[];
  /** validação extra além da checagem padrão do tipo; retorna mensagem de erro ou null se ok */
  validateExtra?: (raw: string) => string | null;
}

export interface ImportLayoutConfig {
  entityKey: string;
  title: string;
  description?: string;
  fields: ImportFieldConfig[];
}

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  fileName: string;
}

export interface ColumnMapping {
  columnIndex: number;
  targetKey: string | null;
  confidence?: number;
}

export interface ImportRowResult {
  rowIndex: number;
  /** valores já resolvidos por campo (para node-ref, o id resolvido) */
  values: Record<string, string>;
  /** texto original de cada campo, para o usuário conferir/editar */
  rawValues: Record<string, string>;
  errors: Record<string, string>;
  skip: boolean;
}

/** Prefixo do valor resolvido de um node-ref que aponta para outra linha do mesmo arquivo. */
export const BATCH_REF_PREFIX = "@batch:";

export type ImportStep = "upload" | "mapping" | "review" | "done";

export interface ImportRunSummary {
  successCount: number;
  errorCount: number;
  errors: { rowIndex: number; message: string }[];
}
