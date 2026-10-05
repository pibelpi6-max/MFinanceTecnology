export interface ExpenseEntryRow {
  id: string;
  year: number;
  month: number;
  accountNodeId: string;
  costCenterNodeId: string;
  entityNodeId: string;
  amount: number;
  description: string | null;
  source: string;
  createdAt: string;
}

export interface ComparisonCell {
  accountNodeId: string;
  costCenterNodeId: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  tolerancePct: number;
  overTolerance: boolean;
  explanation: string | null;
  explanationId: string | null;
}

export type ToleranceType = "percentual" | "absoluto";

export interface ToleranceRow {
  id: string;
  year: number;
  costCenterNodeId: string | null;
  accountNodeId: string | null;
  thresholdType: ToleranceType;
  thresholdValue: number;
}
