export type PackageStatus = "rascunho" | "em_elaboracao" | "submetido" | "aprovado" | "rejeitado";

export interface BudgetPackageRow {
  id: string;
  year: number;
  name: string;
  costCenterNodeId: string | null;
  costCenterName: string | null;
  entityNodeId: string | null;
  entityName: string | null;
  status: PackageStatus;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
  entriesCount: number;
}

export interface PackageStatusHistoryRow {
  id: string;
  fromStatus: PackageStatus | null;
  toStatus: PackageStatus;
  comment: string | null;
  changedByUserId: string | null;
  createdAt: string;
}
