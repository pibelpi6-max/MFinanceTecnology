// Códigos das dimensões estruturais do sistema (Conta, Centro de Custo, Entidade).
//
// Esses 3 códigos são referenciados como texto literal em dezenas de lugares do
// sistema (Matriz, Despesas Realizadas, Comparativo, Pacotes, importações) pra
// localizar a dimensão certa. Por isso NÃO podem ser renomeados livremente —
// se precisar trocar algum, troque aqui, nunca direto no banco.
export const DIMENSION_CODES = {
  CONTA: "conta",
  CENTRO_CUSTO: "centro_custo",
  ENTIDADE: "departamentos",
  /** Usada pelo módulo de Receita (não protegida: pode ser criada/renomeada em Parâmetros). */
  PRODUTO: "produto",
} as const;

export type ProtectedDimensionCode = (typeof DIMENSION_CODES)[keyof typeof DIMENSION_CODES];

export const PROTECTED_DIMENSION_CODES: readonly string[] = [
  DIMENSION_CODES.CONTA,
  DIMENSION_CODES.CENTRO_CUSTO,
  DIMENSION_CODES.ENTIDADE,
];

export function isProtectedDimensionCode(code: string): boolean {
  return PROTECTED_DIMENSION_CODES.includes(code);
}
