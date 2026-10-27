-- =====================================================================
-- Códigos do ERP por item de hierarquia.
--
-- O ERP do cliente pode trazer só o código (sem descrição) no realizado.
-- Cada item do ÚLTIMO nível de qualquer hierarquia pode ter um ou mais
-- códigos do ERP relacionados; o match do realizado usa essa tabela.
--
-- Regras:
--   - vários códigos para o mesmo item (N:1);
--   - o mesmo código não pode apontar para dois itens da mesma hierarquia
--     (unique por tenant + tipo de hierarquia + código);
--   - só itens folha aceitam códigos (validado na aplicação).
--
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists dimension_node_codes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    dimension_type_id uuid not null references dimension_types(id) on delete cascade,
    dimension_node_id uuid not null references dimension_nodes(id) on delete cascade,
    erp_code text not null check (length(btrim(erp_code)) > 0),
    created_at timestamptz not null default now(),
    constraint dimension_node_codes_unique unique (tenant_id, dimension_type_id, erp_code)
);

create index if not exists idx_dimension_node_codes_node
    on dimension_node_codes (tenant_id, dimension_node_id);

alter table dimension_node_codes enable row level security;

drop policy if exists tenant_isolation_select on dimension_node_codes;
drop policy if exists tenant_isolation_write on dimension_node_codes;
drop policy if exists tenant_isolation_update on dimension_node_codes;
drop policy if exists tenant_isolation_delete on dimension_node_codes;
create policy tenant_isolation_select on dimension_node_codes for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on dimension_node_codes for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on dimension_node_codes for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on dimension_node_codes for delete using (tenant_id in (select auth_tenant_ids()));

-- Sem GRANT explícito o Supabase nega o acesso mesmo com RLS (ver 0004_grants.sql).
grant select, insert, update, delete on dimension_node_codes to authenticated;
