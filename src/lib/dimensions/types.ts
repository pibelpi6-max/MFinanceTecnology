export interface DimensionType {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  is_system: boolean;
  sort_order: number;
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
