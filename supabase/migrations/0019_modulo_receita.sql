-- =====================================================================
-- Módulo de Receita (orçamento): preço × volume por produto/mês,
-- deduções (impostos) em % por produto, multimoeda e premissas.
--
-- Modelo:
--   revenue_entries      -> volume e preço unitário por mês, na combinação
--                           Produto × Entidade × eixos extras (jsonb) e moeda.
--   revenue_deductions   -> deduções em % da receita bruta, por produto
--                           (ICMS, PIS, COFINS, ISS, devoluções, outras...).
--   currency_rates       -> taxa de câmbio mensal para a moeda base (BRL).
--   revenue_assumptions  -> premissas aplicáveis em lote (reajuste de preço,
--                           crescimento de volume, sazonalidade) — registro
--                           do que foi aplicado, para rastreabilidade.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists revenue_entries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    year int not null,
    month int not null check (month between 1 and 12),
    product_node_id uuid not null references dimension_nodes(id) on delete cascade,
    entity_node_id uuid references dimension_nodes(id) on delete cascade,
    extra_dimensions jsonb not null default '{}'::jsonb,
    currency text not null default 'BRL',
    volume numeric(18,4) not null default 0,
    unit_price numeric(18,4) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint revenue_entries_unique unique nulls not distinct
        (tenant_id, orcamento_id, year, month, product_node_id, entity_node_id, extra_dimensions, currency)
);

create index if not exists idx_revenue_entries_orc
    on revenue_entries (tenant_id, orcamento_id, year);

create table if not exists revenue_deductions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    product_node_id uuid not null references dimension_nodes(id) on delete cascade,
    code text not null,
    label text not null,
    pct numeric(9,4) not null default 0 check (pct >= 0 and pct <= 100),
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    constraint revenue_deductions_unique unique (tenant_id, orcamento_id, product_node_id, code)
);

create table if not exists currency_rates (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    currency text not null,
    year int not null,
    month int not null check (month between 1 and 12),
    rate numeric(18,6) not null check (rate > 0),
    constraint currency_rates_unique unique (tenant_id, orcamento_id, currency, year, month)
);

create table if not exists revenue_assumptions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    kind text not null check (kind in ('price_adjust','volume_growth','seasonality')),
    product_node_id uuid references dimension_nodes(id) on delete cascade,
    params jsonb not null default '{}'::jsonb,
    created_by uuid,
    created_at timestamptz not null default now()
);

alter table revenue_entries enable row level security;
alter table revenue_deductions enable row level security;
alter table currency_rates enable row level security;
alter table revenue_assumptions enable row level security;

do $$
declare t text;
begin
    foreach t in array array['revenue_entries','revenue_deductions','currency_rates','revenue_assumptions'] loop
        execute format('drop policy if exists tenant_isolation_select on %I', t);
        execute format('drop policy if exists tenant_isolation_write on %I', t);
        execute format('drop policy if exists tenant_isolation_update on %I', t);
        execute format('drop policy if exists tenant_isolation_delete on %I', t);
        execute format('create policy tenant_isolation_select on %I for select using (tenant_id in (select auth_tenant_ids()))', t);
        execute format('create policy tenant_isolation_write on %I for insert with check (tenant_id in (select auth_tenant_ids()))', t);
        execute format('create policy tenant_isolation_update on %I for update using (tenant_id in (select auth_tenant_ids()))', t);
        execute format('create policy tenant_isolation_delete on %I for delete using (tenant_id in (select auth_tenant_ids()))', t);
    end loop;
end $$;

-- Sem GRANT explícito o Supabase nega o acesso mesmo com RLS (ver 0004_grants.sql).
grant select, insert, update, delete
    on revenue_entries, revenue_deductions, currency_rates, revenue_assumptions
    to authenticated;
