-- =====================================================================
-- Permite excluir nós de dimensão e suas versões (item criado no ano
-- corrente que o usuário exclui). Sem policy de DELETE o RLS descartava
-- a exclusão em silêncio (0 linhas), sem erro.
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

drop policy if exists tenant_isolation_delete on dimension_nodes;
create policy tenant_isolation_delete on dimension_nodes
    for delete using (tenant_id in (select auth_tenant_ids()));

drop policy if exists tenant_isolation_delete on dimension_node_versions;
create policy tenant_isolation_delete on dimension_node_versions
    for delete using (
        dimension_node_id in (
            select id from dimension_nodes where tenant_id in (select auth_tenant_ids())
        )
    );
