-- =====================================================================
-- Receita: tipo do item vendido (produto ou serviço).
-- Só serviços são registrados; a ausência de linha significa "produto".
-- Serviços não têm vínculo com ficha técnica (módulo de Custos).
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists revenue_item_kinds (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    dimension_node_id uuid not null references dimension_nodes(id) on delete cascade,
    kind text not null check (kind in ('produto','servico')),
    created_at timestamptz not null default now(),
    constraint revenue_item_kinds_unique unique (tenant_id, dimension_node_id)
);

alter table revenue_item_kinds enable row level security;

drop policy if exists tenant_isolation_select on revenue_item_kinds;
drop policy if exists tenant_isolation_write on revenue_item_kinds;
drop policy if exists tenant_isolation_update on revenue_item_kinds;
drop policy if exists tenant_isolation_delete on revenue_item_kinds;
create policy tenant_isolation_select on revenue_item_kinds for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on revenue_item_kinds for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on revenue_item_kinds for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on revenue_item_kinds for delete using (tenant_id in (select auth_tenant_ids()));

-- Sem GRANT explícito o Supabase nega o acesso mesmo com RLS (ver 0004_grants.sql).
grant select, insert, update, delete on revenue_item_kinds to authenticated;
