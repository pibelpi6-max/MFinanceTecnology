-- =====================================================================
-- Policies de RLS que faltavam para as novas telas (Pacotes, Realizado,
-- Tolerâncias/Desvios): a 0001_init.sql só cobriu select/insert/update
-- em algumas tabelas — sem uma policy "for delete"/"for update"
-- explícita, o Postgres nega a operação mesmo com o GRANT da tabela
-- concedido (mesma pegadinha já documentada para select/insert).
-- =====================================================================

-- budget_packages: exclusão só permitida em rascunho (regra de negócio
-- também validada na aplicação, mas reforçada aqui em profundidade).
create policy tenant_isolation_delete on budget_packages
    for delete using (tenant_id in (select auth_tenant_ids()) and status = 'rascunho');

-- expense_entries (despesas realizadas): permite editar/excluir um
-- lançamento manual.
create policy tenant_isolation_update on expense_entries
    for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on expense_entries
    for delete using (tenant_id in (select auth_tenant_ids()));

-- tolerances: permite remover um limite cadastrado.
create policy tenant_isolation_delete on tolerances
    for delete using (tenant_id in (select auth_tenant_ids()));

-- deviation_explanations: permite corrigir uma explicação já salva.
create policy tenant_isolation_update on deviation_explanations
    for update using (tenant_id in (select auth_tenant_ids()));
