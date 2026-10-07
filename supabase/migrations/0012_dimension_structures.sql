-- =====================================================================
-- "Estruturas": cada dimension_type passa a poder ter várias árvores
-- nomeadas (ex.: "Estrutura 2025", "Estrutura 2026"), em vez de uma só.
-- Motivação: a estrutura de centros de custo/contas/entidades de uma
-- empresa muda ano após ano; a usuária quer poder duplicar a estrutura
-- vigente, dar um nome novo e ajustar, sem perder a anterior (que fica
-- disponível, só marcada como inativa).
--
-- Desenho: dimension_nodes ganha structure_id. Pra não propagar essa
-- mudança pros módulos que já consomem getDimensionTree(tenantId,
-- dimensionTypeId, year) — Matriz, Comparativo, Realizado, Pacotes e os
-- respectivos assistentes de importação —, a função continua recebendo
-- o mesmo dimensionTypeId e resolve sozinha qual é a estrutura ATIVA
-- daquele tipo (no máximo 1 por tipo, garantido pelo índice único
-- parcial abaixo). Isso mantém o comportamento de hoje sem mudar
-- nenhuma dessas telas: elas sempre leem a estrutura ativa.
-- =====================================================================

create table dimension_structures (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references tenants(id) on delete cascade,
    dimension_type_id   uuid not null references dimension_types(id) on delete cascade,
    name                text not null,
    is_active           boolean not null default true,
    sort_order          int not null default 0,
    created_at          timestamptz not null default now(),
    unique (dimension_type_id, name)
);

-- Só pode haver 1 estrutura ativa por dimensão — é ela que alimenta a
-- Matriz, Pacotes, Realizado e o seletor de item-pai (getDimensionTree).
create unique index idx_dimension_structures_one_active
    on dimension_structures (dimension_type_id)
    where is_active;

create index idx_dimension_structures_type on dimension_structures (dimension_type_id);

-- ---------------------------------------------------------------------
-- dimension_nodes passa a pertencer a uma estrutura específica, não mais
-- só ao tipo. tenant_id e dimension_type_id continuam na tabela (não é
-- redundância inútil: são usados por índices/queries existentes e
-- garantem que structure_id sempre aponte pra uma estrutura do mesmo
-- tipo — reforçado em código, já que Postgres não tem "foreign key
-- condicional").
-- ---------------------------------------------------------------------

alter table dimension_nodes add column structure_id uuid references dimension_structures(id) on delete cascade;

-- Backfill: 1 estrutura "Estrutura Principal" por dimension_type já
-- existente, e todo nó atual migra pra ela — zero impacto visual pra
-- quem nunca mexer em "Estruturas".
insert into dimension_structures (tenant_id, dimension_type_id, name, is_active, sort_order)
select tenant_id, id, 'Estrutura Principal', true, 0
from dimension_types;

update dimension_nodes dn
set structure_id = ds.id
from dimension_structures ds
where ds.dimension_type_id = dn.dimension_type_id;

alter table dimension_nodes alter column structure_id set not null;

-- Unicidade de código agora é por estrutura (não mais por tipo direto) —
-- duas estruturas do mesmo tipo podem reaproveitar os mesmos códigos
-- (ex.: duplicar "Estrutura 2025" pra "Estrutura 2026" mantendo os
-- mesmos códigos de centro de custo).
alter table dimension_nodes drop constraint dimension_nodes_tenant_id_dimension_type_id_code_key;
alter table dimension_nodes add constraint dimension_nodes_tenant_id_structure_id_code_key unique (tenant_id, structure_id, code);

create index idx_dimension_nodes_structure on dimension_nodes (structure_id);

-- ---------------------------------------------------------------------
-- RLS — mesmo padrão tenant_isolation das demais tabelas, já incluindo
-- a policy de delete desde o início (migration 0009 existe justamente
-- porque dimension_types nasceu sem ela).
-- ---------------------------------------------------------------------

alter table dimension_structures enable row level security;

create policy tenant_isolation_select on dimension_structures
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on dimension_structures
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on dimension_structures
    for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on dimension_structures
    for delete using (tenant_id in (select auth_tenant_ids()));
