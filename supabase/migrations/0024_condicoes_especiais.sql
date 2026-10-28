-- =====================================================================
-- Receita: condições especiais por estrutura.
-- Uma dedução (ICMS, comissão...) pode ter um percentual diferente para
-- uma parte da estrutura (ex.: um estado) e/ou para um produto específico.
-- Vale a regra mais específica: produto + estrutura > estrutura > produto > padrão.
-- entity_node_id e product_node_id nulos = "todos". Valem também para os
-- filhos do nó escolhido na hierarquia.
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists revenue_deduction_rules (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    label text not null check (length(btrim(label)) > 0),
    entity_node_id uuid references dimension_nodes(id) on delete cascade,
    product_node_id uuid references dimension_nodes(id) on delete cascade,
    pct numeric(9,4) not null default 0 check (pct >= 0 and pct <= 100),
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    constraint revenue_deduction_rules_scope check (entity_node_id is not null or product_node_id is not null),
    constraint revenue_deduction_rules_unique unique nulls not distinct (tenant_id, label, entity_node_id, product_node_id)
);

create index if not exists idx_revenue_deduction_rules_tenant on revenue_deduction_rules (tenant_id);

alter table revenue_deduction_rules enable row level security;

drop policy if exists tenant_isolation_select on revenue_deduction_rules;
drop policy if exists tenant_isolation_write on revenue_deduction_rules;
drop policy if exists tenant_isolation_update on revenue_deduction_rules;
drop policy if exists tenant_isolation_delete on revenue_deduction_rules;
create policy tenant_isolation_select on revenue_deduction_rules for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on revenue_deduction_rules for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on revenue_deduction_rules for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on revenue_deduction_rules for delete using (tenant_id in (select auth_tenant_ids()));

-- Sem GRANT explícito o Supabase nega o acesso mesmo com RLS (ver 0004_grants.sql).
grant select, insert, update, delete on revenue_deduction_rules to authenticated;
