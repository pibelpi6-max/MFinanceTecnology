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

export type OrcamentoStatus = "rascunho" | "ativo" | "encerrado";

export interface Orcamento {
  id: string;
  tenant_id: string;
  year: number;
  label: string;
  status: OrcamentoStatus;
  conjunto_estrutura_id: string | null;
  created_at: string;
  updated_at: string;
}
