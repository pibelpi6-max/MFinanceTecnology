-- =====================================================================
-- Orçamento (versões/revisões) + Conjunto de Estruturas — decidido com
-- a usuária em 06/10 (ver "Orçamento (entidade nova, versões/revisões)"
-- em claude/decisoes-arquitetura.md do projeto).
--
-- Motivação: a usuária pediu para poder manter mais de uma Estrutura
-- "ativa" ao mesmo tempo, para usar estruturas diferentes em cenários
-- diferentes. Hoje (migration 0012) só pode haver 1 estrutura ativa por
-- dimensão (índice único parcial) e é ela — só ela — que alimenta
-- Matriz, Pacotes, Realizado e o seletor de item-pai. Confirmado via
-- pergunta direta que o passo certo não é só liberar o toggle de
-- "Ativa" sem mais nada — é introduzir uma entidade nova, Orçamento,
-- que decide de fato qual conjunto de estruturas está em uso, por
-- cenário/revisão.
--
-- Desenho:
--   - Conjunto de Estruturas: entidade nova, nomeada (ex. "Conservador
--     2026"), que amarra 1 Estrutura (dimension_structures) de cada
--     tipo de dimensão — reaproveita as estruturas já existentes, só
--     adiciona o agrupamento em cima.
--   - Orçamento: entidade nova, versionada (ano + rótulo de revisão +
--     status), que referencia exatamente 1 Conjunto de Estruturas.
--   - matrix_budget_entries e budget_packages ganham orcamento_id
--     (nullable — dado já existente continua funcionando sem
--     Orçamento até a tela que o usa ser religada, próxima etapa).
--   - O índice único parcial que só permitia 1 estrutura ativa por
--     dimensão é removido: "ativa" deixa de ser uma trava global, uma
--     Estrutura só precisa estar disponível pra ser escolhida por
--     algum Conjunto (setDimensionStructureActive também para de
--     desativar as demais — ver código da Server Action).
--
-- Fora de escopo nesta migration (ver pendência no doc do projeto):
-- religar de fato Matriz/Pacotes/Realizado/Comparativo para resolver a
-- estrutura através do Orçamento em vez de getActiveStructureId — isso
-- fica para a próxima etapa, por ser a parte que toca as telas que já
-- têm dado de produção.
-- =====================================================================

create table conjuntos_estrutura (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    name        text not null,
    created_at  timestamptz not null default now(),
    unique (tenant_id, name)
);

create table conjunto_estrutura_items (
    id                  uuid primary key default gen_random_uuid(),
    conjunto_id         uuid not null references conjuntos_estrutura(id) on delete cascade,
    dimension_type_id   uuid not null references dimension_types(id) on delete cascade,
    structure_id        uuid not null references dimension_structures(id) on delete restrict,
    unique (conjunto_id, dimension_type_id)
);

create index idx_conjunto_estrutura_items_conjunto on conjunto_estrutura_items (conjunto_id);
create index idx_conjunto_estrutura_items_structure on conjunto_estrutura_items (structure_id);

create type orcamento_status as enum ('rascunho', 'ativo', 'encerrado');

create table orcamentos (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references tenants(id) on delete cascade,
    year                    int not null,
    label                   text not null,
    status                  orcamento_status not null default 'rascunho',
    conjunto_estrutura_id   uuid references conjuntos_estrutura(id),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (tenant_id, year, label)
);

create index idx_orcamentos_tenant_year on orcamentos (tenant_id, year);

alter table matrix_budget_entries add column if not exists orcamento_id uuid references orcamentos(id);
alter table budget_packages add column if not exists orcamento_id uuid references orcamentos(id);

create index if not exists idx_matrix_budget_entries_orcamento on matrix_budget_entries (orcamento_id);
create index if not exists idx_budget_packages_orcamento on budget_packages (orcamento_id);

-- "Ativa" deixa de ser exclusiva por dimensão — várias estruturas da
-- mesma dimensão podem ficar marcadas "Ativa" (= disponível pra uso) ao
-- mesmo tempo; quem decide qual entra em cada cenário é o Orçamento,
-- via seu Conjunto de Estruturas.
drop index if exists idx_dimension_structures_one_active;

-- ---------------------------------------------------------------------
-- RLS — mesmo padrão tenant_isolation das demais tabelas.
-- conjunto_estrutura_items não tem tenant_id direto (seria redundante
-- com conjuntos_estrutura.tenant_id); a policy resolve o tenant via
-- join na própria tabela pai.
-- ---------------------------------------------------------------------

alter table conjuntos_estrutura enable row level security;

create policy tenant_isolation_select on conjuntos_estrutura
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on conjuntos_estrutura
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on conjuntos_estrutura
    for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on conjuntos_estrutura
    for delete using (tenant_id in (select auth_tenant_ids()));

alter table conjunto_estrutura_items enable row level security;

create policy tenant_isolation_select on conjunto_estrutura_items
    for select using (
        conjunto_id in (select id from conjuntos_estrutura where tenant_id in (select auth_tenant_ids()))
    );
create policy tenant_isolation_write on conjunto_estrutura_items
    for insert with check (
        conjunto_id in (select id from conjuntos_estrutura where tenant_id in (select auth_tenant_ids()))
    );
create policy tenant_isolation_update on conjunto_estrutura_items
    for update using (
        conjunto_id in (select id from conjuntos_estrutura where tenant_id in (select auth_tenant_ids()))
    );
create policy tenant_isolation_delete on conjunto_estrutura_items
    for delete using (
        conjunto_id in (select id from conjuntos_estrutura where tenant_id in (select auth_tenant_ids()))
    );

alter table orcamentos enable row level security;

create policy tenant_isolation_select on orcamentos
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on orcamentos
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on orcamentos
    for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on orcamentos
    for delete using (tenant_id in (select auth_tenant_ids()));

-- ---------------------------------------------------------------------
-- GRANTs — ver nota em 0004_grants.sql / 0013_dimension_structures_grants.sql:
-- RLS + policies não bastam, o Postgres também exige GRANT explícito
-- na tabela para o role "authenticated".
-- ---------------------------------------------------------------------

grant select, insert, update, delete on conjuntos_estrutura to authenticated;
grant select, insert, update, delete on conjunto_estrutura_items to authenticated;
grant select, insert, update, delete on orcamentos to authenticated;
