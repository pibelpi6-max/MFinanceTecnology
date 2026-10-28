-- =====================================================================
-- Receita: premissas guardadas (não sobrescrevem o que foi lançado).
-- Cada premissa é um crescimento de volume (% ao mês) ou um reajuste de
-- preço (% uma vez), a partir de um mês, para um recorte opcional:
--   product_node_ids  = produtos/famílias (vazio = todos)
--   dimension_filters = {"<dimension_type_id>": ["<node_id>", ...]} (vazio = todos)
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists revenue_premises (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    kind text not null check (kind in ('volume_growth', 'price_adjust')),
    pct numeric(9,4) not null check (pct > -100 and pct <= 1000),
    from_month int not null check (from_month between 1 and 12),
    base text not null default 'entered' check (base in ('entered', 'previous_month')),
    product_node_ids uuid[] not null default '{}',
    dimension_filters jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    sort_order int not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_revenue_premises_orc on revenue_premises (tenant_id, orcamento_id);

alter table revenue_premises enable row level security;

drop policy if exists tenant_isolation_select on revenue_premises;
drop policy if exists tenant_isolation_write on revenue_premises;
drop policy if exists tenant_isolation_update on revenue_premises;
drop policy if exists tenant_isolation_delete on revenue_premises;
create policy tenant_isolation_select on revenue_premises for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on revenue_premises for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on revenue_premises for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on revenue_premises for delete using (tenant_id in (select auth_tenant_ids()));

-- Sem GRANT explícito o Supabase nega o acesso mesmo com RLS (ver 0004_grants.sql).
grant select, insert, update, delete on revenue_premises to authenticated;
