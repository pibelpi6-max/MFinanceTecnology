-- =====================================================================
-- Matriz Orçamentária por Pacote: a mesma célula (ano/mês/entidade/
-- centro de custo/conta/eixos extras/orçamento) passa a poder ter um
-- valor por Pacote (cada gestor lança o seu), além do "sem pacote".
--
-- A unique constraint ganha package_id. NULLS NOT DISTINCT (Postgres
-- 15+) faz o "sem pacote" (package_id NULL) continuar colidindo com ele
-- mesmo no upsert — sem isso, duas linhas com package_id NULL nunca
-- seriam consideradas duplicadas.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

alter table matrix_budget_entries
    drop constraint if exists matrix_budget_entries_unique_entry;

alter table matrix_budget_entries
    add constraint matrix_budget_entries_unique_entry
    unique nulls not distinct (
        tenant_id, year, month, cost_center_node_id, account_node_id,
        entity_node_id, extra_dimensions, orcamento_id, package_id
    );
