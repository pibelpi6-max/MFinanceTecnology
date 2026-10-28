-- Moedas da empresa (cadastro geral, em Parâmetros). As taxas continuam por orçamento.
-- Idempotente.
create table if not exists tenant_currencies (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    code text not null check (code ~ '^[A-Z]{3}$'),
    name text not null default '',
    created_at timestamptz not null default now(),
    constraint tenant_currencies_unique unique (tenant_id, code)
);

alter table tenant_currencies enable row level security;

drop policy if exists tenant_isolation_select on tenant_currencies;
drop policy if exists tenant_isolation_write on tenant_currencies;
drop policy if exists tenant_isolation_update on tenant_currencies;
drop policy if exists tenant_isolation_delete on tenant_currencies;
create policy tenant_isolation_select on tenant_currencies for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on tenant_currencies for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on tenant_currencies for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on tenant_currencies for delete using (tenant_id in (select auth_tenant_ids()));

grant select, insert, update, delete on tenant_currencies to authenticated;
