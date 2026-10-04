-- =====================================================================
-- Módulos: classificação livre (definida pela própria usuária) para
-- agrupar em quais áreas do sistema (ex: "Orçamento Matricial",
-- "Fornecedor", "Capex", "Projeto", "FP&A") cada tipo de dimensão pode
-- ser usado. Hoje (04/10) nenhuma tela ainda filtra dimensões por
-- módulo — esta migration entrega só a base de dados (gestão de
-- módulos + associação N:N com dimension_types); o "enforcement" (só
-- mostrar a dimensão certa dentro de cada módulo) é trabalho futuro,
-- por módulo, conforme cada um ganhar sua própria tela.
--
-- Modelagem espelha dimension_types (tenant-scoped, code único por
-- tenant) por consistência e para reaproveitar os mesmos padrões de
-- RLS já validados neste projeto.
-- =====================================================================

create table modules (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    code        text not null,
    name        text not null,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now(),
    unique (tenant_id, code)
);

-- tenant_id fica denormalizado aqui (em vez de só herdar via join com
-- dimension_types/modules) de propósito: lição já registrada nesta
-- sessão (ver decisoes-arquitetura.md) de que RLS baseada em subquery
-- de embed é mais frágil/fácil de esquecer do que comparar uma coluna
-- tenant_id direta.
create table dimension_type_modules (
    dimension_type_id  uuid not null references dimension_types(id) on delete cascade,
    module_id           uuid not null references modules(id) on delete cascade,
    tenant_id           uuid not null references tenants(id) on delete cascade,
    created_at          timestamptz not null default now(),
    primary key (dimension_type_id, module_id)
);

alter table modules enable row level security;
alter table dimension_type_modules enable row level security;

-- modules: select/insert/update/delete (mesmo padrão das 4 operações
-- usadas pela tela, já reforçado por uma lacuna encontrada antes nesta
-- mesma área em dimension_types — ver migration 0009).
create policy tenant_isolation_select on modules
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on modules
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on modules
    for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on modules
    for delete using (tenant_id in (select auth_tenant_ids()));

-- dimension_type_modules: só select/insert/delete (a associação nunca é
-- "atualizada" em uma linha existente — é sempre substituída via
-- delete + insert, ver syncDimensionTypeModules em _actions.ts).
create policy tenant_isolation_select on dimension_type_modules
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on dimension_type_modules
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on dimension_type_modules
    for delete using (tenant_id in (select auth_tenant_ids()));

grant select, insert, update, delete on modules, dimension_type_modules to authenticated;
