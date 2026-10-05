import { createClient } from "@/lib/supabase/server";
import type { ExpenseEntryRow, ToleranceRow } from "./types";

export async function getExpenseEntries(
  tenantId: string,
  year: number,
  month: number,
  entityNodeId: string
): Promise<ExpenseEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_entries")
    .select("id, year, month, account_node_id, cost_center_node_id, entity_node_id, amount, description, source, created_at")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .eq("month", month)
    .eq("entity_node_id", entityNodeId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    year: row.year,
    month: row.month,
    accountNodeId: row.account_node_id,
    costCenterNodeId: row.cost_center_node_id,
    entityNodeId: row.entity_node_id,
    amount: Number(row.amount),
    description: row.description,
    source: row.source,
    createdAt: row.created_at,
  }));
}

/** [accountId][costCenterId] = soma dos lançamentos manuais/importados naquele mês. */
export function sumActualsByCell(entries: ExpenseEntryRow[]): Record<string, Record<string, number>> {
  const totals: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!totals[e.accountNodeId]) totals[e.accountNodeId] = {};
    totals[e.accountNodeId][e.costCenterNodeId] = (totals[e.accountNodeId][e.costCenterNodeId] ?? 0) + e.amount;
  }
  return totals;
}

export async function getTolerances(tenantId: string, year: number): Promise<ToleranceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tolerances")
    .select("id, year, cost_center_node_id, account_node_id, threshold_type, threshold_value")
    .eq("tenant_id", tenantId)
    .eq("year", year);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    year: row.year,
    costCenterNodeId: row.cost_center_node_id,
    accountNodeId: row.account_node_id,
    thresholdType: row.threshold_type,
    thresholdValue: Number(row.threshold_value),
  }));
}

const DEFAULT_TOLERANCE_PCT = 10;

/** Resolve a tolerância aplicável a uma célula: específica (conta+CC) > por conta > por CC > global > default. */
export function resolveTolerancePct(
  tolerances: ToleranceRow[],
  accountNodeId: string,
  costCenterNodeId: string
): number {
  const specific = tolerances.find((t) => t.accountNodeId === accountNodeId && t.costCenterNodeId === costCenterNodeId);
  const byAccount = tolerances.find((t) => t.accountNodeId === accountNodeId && !t.costCenterNodeId);
  const byCostCenter = tolerances.find((t) => t.costCenterNodeId === costCenterNodeId && !t.accountNodeId);
  const global = tolerances.find((t) => !t.accountNodeId && !t.costCenterNodeId);
  const match = specific ?? byAccount ?? byCostCenter ?? global;
  if (!match) return DEFAULT_TOLERANCE_PCT;
  // threshold "absoluto" não se resume a um % único por célula — tratado como 0%
  // (qualquer desvio já sinaliza) para manter a UI simples no MVP.
  return match.thresholdType === "percentual" ? match.thresholdValue : 0;
}

export async function getDeviationExplanations(
  tenantId: string,
  year: number,
  month: number
): Promise<Record<string, { id: string; explanation: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deviation_explanations")
    .select("id, account_node_id, cost_center_node_id, explanation")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .eq("month", month);

  if (error) throw new Error(error.message);

  const map: Record<string, { id: string; explanation: string }> = {};
  for (const row of data ?? []) {
    map[`${row.account_node_id}:${row.cost_center_node_id}`] = { id: row.id, explanation: row.explanation };
  }
  return map;
}
