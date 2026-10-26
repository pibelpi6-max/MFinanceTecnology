import { createClient } from "@/lib/supabase/server";
import type { MatrixEntry } from "./types";

/**
 * Qual recorte de Pacote a Matriz mostra: `all` = consolidado (soma de
 * todos os pacotes + sem pacote), `none` = lançamentos sem pacote,
 * `package` = só os de um Pacote.
 */
export type PackageScope = { kind: "all" } | { kind: "none" } | { kind: "package"; id: string };

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
  /**
   * Orçamento selecionado no seletor global (ver
   * src/lib/orcamentos/queries.ts#getOrcamentoContext) — `null` lê o
   * bucket implícito de lançamentos legados (orcamento_id IS NULL),
   * criados antes da religação ao Orçamento (migration
   * 0015_religar_orcamento.sql).
   */
  orcamentoId: string | null,
  /** { [dimensionTypeId]: dimensionNodeId } dos eixos extras selecionados (ver 0011_matriz_eixos_extras.sql). */
  extraDimensions: Record<string, string> = {},
  packageScope: PackageScope = { kind: "none" }
): Promise<MatrixEntry[]> {
  const supabase = await createClient();
  let query = supabase
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
  query = orcamentoId ? query.eq("orcamento_id", orcamentoId) : query.is("orcamento_id", null);
  if (packageScope.kind === "none") query = query.is("package_id", null);
  else if (packageScope.kind === "package") query = query.eq("package_id", packageScope.id);

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  // Consolidado: várias linhas (uma por pacote) para a mesma célula — soma.
  const sums = new Map<string, MatrixEntry>();
  for (const row of data ?? []) {
    const key = `${row.account_node_id}:${row.cost_center_node_id}`;
    const prev = sums.get(key);
    if (prev) prev.amount += Number(row.amount);
    else
      sums.set(key, {
        accountNodeId: row.account_node_id,
        costCenterNodeId: row.cost_center_node_id,
        amount: Number(row.amount),
      });
  }
  return Array.from(sums.values());
}
