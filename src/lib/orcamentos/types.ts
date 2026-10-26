export interface ConjuntoEstrutura {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

/** 1 linha por tipo de dimensão coberto por um Conjunto — amarra o Conjunto
 * a exatamente 1 Estrutura (dimension_structures) daquele tipo. */
export interface ConjuntoEstruturaItem {
  id: string;
  conjunto_id: string;
  dimension_type_id: string;
  structure_id: string;
}

export type OrcamentoStatus = "rascunho" | "em_elaboracao" | "aprovado" | "ativo" | "encerrado";

export type OrcamentoTipo = "orcamento" | "revisao" | "forecast" | "cenario" | "teste";

export const ORCAMENTO_TIPOS: OrcamentoTipo[] = ["orcamento", "revisao", "forecast", "cenario", "teste"];
export const ORCAMENTO_STATUSES: OrcamentoStatus[] = ["rascunho", "em_elaboracao", "aprovado", "ativo", "encerrado"];
/** Limite do nome do orçamento (o texto longo vai na descrição). */
export const ORCAMENTO_LABEL_MAX = 60;

export interface Orcamento {
  id: string;
  tenant_id: string;
  year: number;
  label: string;
  status: OrcamentoStatus;
  tipo: OrcamentoTipo;
  /** Orçamento oficial do ano (no máximo um por ano). */
  oficial: boolean;
  description: string | null;
  conjunto_estrutura_id: string | null;
  created_at: string;
  updated_at: string;
}
