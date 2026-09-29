import { createClient } from "@/lib/supabase/server";
import type { MatrixEntry } from "./types";

/**
 * Lançamentos da matriz orçamentária (conta × centro de custo) para
 * uma entidade, ano e mês específicos. Orçamento pode existir sem
 * pacote (package_id fica null) — a associação com um pacote é um
 * recurso futuro.
 */
export async function getMatrixEntries(
  tenantId: string,
  year: number,
  month: number,
  entityNodeId: string
): Promise<MatrixEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matrix_budget_entries")
    .select("account_node_id, cost_center_node_id, amount")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .eq("month", month)
    .eq("entity_node_id", entityNodeId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    accountNodeId: row.account_node_id,
    costCenterNodeId: row.cost_center_node_id,
    amount: Number(row.amount),
  }));
}
