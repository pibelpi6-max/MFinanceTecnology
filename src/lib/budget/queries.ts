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
  entityNodeId: string,
  /** { [dimensionTypeId]: dimensionNodeId } dos eixos extras selecionados (ver 0011_matriz_eixos_extras.sql). */
  extraDimensions: Record<string, string> = {}
): Promise<MatrixEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matrix_budget_entries")
    .select("account_node_id, cost_center_node_id, amount")
    .eq("tenant_id", tenantId)
    .eq("year", year)
    .eq("month", month)
    .eq("entity_node_id", entityNodeId)
    // supabase-js não serializa objetos em .eq() (só interpola `eq.${value}`,
    // o que viraria "eq.[object Object]" e quebra o parser json do Postgres
    // com "invalid input syntax for type json") — por isso o JSON.stringify
    // explícito aqui. "{}" é texto JSON válido e casa normalmente com o
    // default da coluna.
    .eq("extra_dimensions", JSON.stringify(extraDimensions));

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    accountNodeId: row.account_node_id,
    costCenterNodeId: row.cost_center_node_id,
    amount: Number(row.amount),
  }));
}
