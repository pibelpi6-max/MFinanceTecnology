export interface DimensionType {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  /** Se esta dimensão aparece como eixo extra (filtro) na Matriz Orçamentária. */
  use_in_matriz: boolean;
}

export interface DimensionNodeRow {
  id: string;
  versionId: string;
  code: string;
  name: string;
  parentNodeId: string | null;
  level: number;
  validFromYear: number;
  validUntilYear: number | null;
}
