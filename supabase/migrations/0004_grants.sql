-- =====================================================================
-- GRANTs para o papel "authenticated" do Supabase.
--
-- Habilitar RLS + criar policies não é suficiente: o Postgres também
-- exige GRANT explícito na tabela para o role, senão o acesso é negado
-- antes mesmo de a policy ser avaliada (erro 42501 "permission denied
-- for table ..."). Normalmente o Supabase concede isso automaticamente
-- via "default privileges" para tabelas novas, mas nesse projeto as
-- tabelas ficaram sem o grant — este arquivo corrige isso de uma vez
-- para todas as tabelas de negócio.
-- =====================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on
    tenants,
    profiles,
    user_tenant_roles,
    dimension_types,
    dimension_nodes,
    dimension_node_versions,
    budget_packages,
    matrix_budget_entries,
    expense_entries,
    tolerances,
    deviation_explanations,
    tenant_labels,
    user_preferences
to authenticated;

grant select on dimension_node_versions_by_year to authenticated;
