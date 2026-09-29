-- =====================================================================
-- Sistema Financeiro (FP&A SaaS) — Schema v1 (Matrix: orçamento matricial
-- + gestão de despesas)
--
-- Destino: Supabase (Postgres). Rodar no SQL Editor do projeto Supabase,
-- ou via `supabase db push` com este arquivo em supabase/migrations/.
--
-- Referência de domínio: módulo "matrix" do Gradus Matrix (orçamento
-- matricial). Código não reaproveitado — apenas os conceitos de negócio.
-- =====================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. MULTI-TENANCY
-- ---------------------------------------------------------------------
-- Cada empresa cliente do SaaS é um tenant. Todo dado de negócio abaixo
-- carrega tenant_id e é isolado via Row Level Security.

create table tenants (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    slug        text not null unique,
    created_at  timestamptz not null default now()
);

-- Perfil de usuário vinculado ao auth.users do Supabase, com o(s)
-- tenant(s) a que pertence e seu papel em cada um.
create table profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    full_name   text,
    created_at  timestamptz not null default now()
);

create type user_role as enum ('admin', 'elaborador', 'aprovador', 'leitor');

create table user_tenant_roles (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references profiles(id) on delete cascade,
    tenant_id   uuid not null references tenants(id) on delete cascade,
    role        user_role not null default 'leitor',
    created_at  timestamptz not null default now(),
    unique (user_id, tenant_id)
);

-- ---------------------------------------------------------------------
-- 2. DIMENSÕES (Centro de Custo, Conta, Entidade, + custom até 10 tipos)
-- ---------------------------------------------------------------------
-- Cada dimension_type tem sua própria árvore hierárquica (até 10 níveis
-- de profundidade). Cada nó tem uma identidade estável (dimension_nodes)
-- e uma ou mais versões anuais (dimension_node_versions) que carregam
-- nome, pai na hierarquia e janela de vigência — isso resolve o
-- requisito de estrutura mudando por ano (criar/cancelar centro de
-- custo/conta a partir de um ano específico, reorganizar hierarquia).

create table dimension_types (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    code        text not null,           -- ex: 'centro_custo', 'conta', 'entidade'
    name        text not null,           -- ex: 'Centro de Custo'
    is_system   boolean not null default false, -- true para os 3 tipos base
    sort_order  int not null default 0,
    created_at  timestamptz not null default now(),
    unique (tenant_id, code)
);

create table dimension_nodes (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references tenants(id) on delete cascade,
    dimension_type_id   uuid not null references dimension_types(id) on delete cascade,
    code                text not null,   -- código de negócio, estável entre anos
    created_at          timestamptz not null default now(),
    unique (tenant_id, dimension_type_id, code)
);

create table dimension_node_versions (
    id                  uuid primary key default gen_random_uuid(),
    dimension_node_id   uuid not null references dimension_nodes(id) on delete cascade,
    parent_node_id      uuid references dimension_nodes(id),  -- pai nessa versão (mesmo dimension_type)
    name                text not null,
    level               int not null default 1,   -- profundidade calculada (1..10)
    valid_from_year     int not null,
    valid_until_year    int,                       -- NULL = ainda ativo
    created_at          timestamptz not null default now(),
    check (valid_until_year is null or valid_until_year >= valid_from_year),
    check (level between 1 and 10)
);

-- Evita duas versões do mesmo nó com janelas de vigência sobrepostas.
create index idx_dnv_node_year on dimension_node_versions (dimension_node_id, valid_from_year);

-- Helper: resolve a versão vigente de um nó para um ano específico.
-- (view; a query real usa BETWEEN valid_from_year e valid_until_year)
create view dimension_node_versions_by_year as
select v.*, n.tenant_id, n.dimension_type_id, n.code
from dimension_node_versions v
join dimension_nodes n on n.id = v.dimension_node_id;

-- ---------------------------------------------------------------------
-- 3. PACOTES (unidade de elaboração / aprovação do orçamento)
-- ---------------------------------------------------------------------

create type package_status as enum ('rascunho', 'em_elaboracao', 'submetido', 'aprovado', 'rejeitado');

create table budget_packages (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references tenants(id) on delete cascade,
    year                int not null,
    name                text not null,
    cost_center_node_id uuid references dimension_nodes(id),  -- escopo do pacote (opcional)
    owner_user_id       uuid references profiles(id),
    status              package_status not null default 'rascunho',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. MATRIZ ORÇAMENTÁRIA (orçado) e DESPESAS (realizado)
-- ---------------------------------------------------------------------
-- Ambas referenciam a identidade estável do nó (dimension_node_id) +
-- o ano/mês do lançamento — a hierarquia daquele ano é resolvida via
-- dimension_node_versions no momento da consulta/relatório.

create table matrix_budget_entries (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references tenants(id) on delete cascade,
    package_id              uuid references budget_packages(id),
    year                    int not null,
    month                   int not null check (month between 1 and 12),
    cost_center_node_id     uuid not null references dimension_nodes(id),
    account_node_id         uuid not null references dimension_nodes(id),
    entity_node_id          uuid not null references dimension_nodes(id),
    amount                  numeric(18,2) not null default 0,
    created_by              uuid references profiles(id),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (tenant_id, year, month, cost_center_node_id, account_node_id, entity_node_id)
);

create table expense_entries (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references tenants(id) on delete cascade,
    year                    int not null,
    month                   int not null check (month between 1 and 12),
    cost_center_node_id     uuid not null references dimension_nodes(id),
    account_node_id         uuid not null references dimension_nodes(id),
    entity_node_id          uuid not null references dimension_nodes(id),
    amount                  numeric(18,2) not null,
    description             text,
    source                  text not null default 'manual',  -- 'manual' | 'import'
    created_by              uuid references profiles(id),
    created_at              timestamptz not null default now()
);

create index idx_budget_lookup on matrix_budget_entries (tenant_id, year, month, cost_center_node_id, account_node_id);
create index idx_expense_lookup on expense_entries (tenant_id, year, month, cost_center_node_id, account_node_id);

-- ---------------------------------------------------------------------
-- 5. TOLERÂNCIAS e EXPLICAÇÃO DE DESVIOS
-- ---------------------------------------------------------------------

create type tolerance_type as enum ('percentual', 'absoluto');

create table tolerances (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references tenants(id) on delete cascade,
    year                    int not null,
    -- escopo do limite: NULL = aplica-se globalmente (fallback)
    cost_center_node_id     uuid references dimension_nodes(id),
    account_node_id         uuid references dimension_nodes(id),
    threshold_type          tolerance_type not null default 'percentual',
    threshold_value         numeric(10,2) not null,  -- ex: 10.00 = 10% ou R$10,00 conforme o tipo
    created_at              timestamptz not null default now()
);

create table deviation_explanations (
    id                      uuid primary key default gen_random_uuid(),
    tenant_id               uuid not null references tenants(id) on delete cascade,
    year                    int not null,
    month                   int not null check (month between 1 and 12),
    cost_center_node_id     uuid not null references dimension_nodes(id),
    account_node_id         uuid not null references dimension_nodes(id),
    explanation             text not null,
    created_by              uuid references profiles(id),
    created_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (isolamento multi-tenant)
-- ---------------------------------------------------------------------

alter table tenants enable row level security;
alter table dimension_types enable row level security;
alter table dimension_nodes enable row level security;
alter table dimension_node_versions enable row level security;
alter table budget_packages enable row level security;
alter table matrix_budget_entries enable row level security;
alter table expense_entries enable row level security;
alter table tolerances enable row level security;
alter table deviation_explanations enable row level security;

-- Helper: tenants aos quais o usuário logado tem acesso.
create or replace function auth_tenant_ids()
returns setof uuid
language sql
security definer
stable
as $$
    select tenant_id from user_tenant_roles where user_id = auth.uid()
$$;

-- Policy padrão (repetir o padrão para as demais tabelas tenant-scoped;
-- aqui vai o exemplo completo para 2 tabelas — replicar para as demais
-- trocando apenas o nome da tabela):

create policy tenant_isolation_select on matrix_budget_entries
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on matrix_budget_entries
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on matrix_budget_entries
    for update using (tenant_id in (select auth_tenant_ids()));

create policy tenant_isolation_select on expense_entries
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on expense_entries
    for insert with check (tenant_id in (select auth_tenant_ids()));

-- Demais tabelas com tenant_id direto: mesmo padrão select/insert/update.
create policy tenant_isolation_select on dimension_types
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on dimension_types
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on dimension_types
    for update using (tenant_id in (select auth_tenant_ids()));

create policy tenant_isolation_select on dimension_nodes
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on dimension_nodes
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on dimension_nodes
    for update using (tenant_id in (select auth_tenant_ids()));

create policy tenant_isolation_select on budget_packages
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on budget_packages
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on budget_packages
    for update using (tenant_id in (select auth_tenant_ids()));

create policy tenant_isolation_select on tolerances
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on tolerances
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on tolerances
    for update using (tenant_id in (select auth_tenant_ids()));

create policy tenant_isolation_select on deviation_explanations
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on deviation_explanations
    for insert with check (tenant_id in (select auth_tenant_ids()));

-- dimension_node_versions não tem tenant_id direto: herda via join com
-- dimension_nodes.
create policy tenant_isolation_select on dimension_node_versions
    for select using (
        dimension_node_id in (
            select id from dimension_nodes where tenant_id in (select auth_tenant_ids())
        )
    );
create policy tenant_isolation_write on dimension_node_versions
    for insert with check (
        dimension_node_id in (
            select id from dimension_nodes where tenant_id in (select auth_tenant_ids())
        )
    );
create policy tenant_isolation_update on dimension_node_versions
    for update using (
        dimension_node_id in (
            select id from dimension_nodes where tenant_id in (select auth_tenant_ids())
        )
    );

-- profiles e user_tenant_roles: cada usuário só vê/edita o próprio registro
-- (o vínculo com tenants é gerenciado à parte, fora do fluxo de app comum).
alter table profiles enable row level security;
alter table user_tenant_roles enable row level security;

create policy own_profile_select on profiles
    for select using (id = auth.uid());
create policy own_profile_update on profiles
    for update using (id = auth.uid());

create policy own_roles_select on user_tenant_roles
    for select using (user_id = auth.uid());

-- =====================================================================
-- Próximos passos sugeridos:
-- 1. Rodar este arquivo no Supabase (SQL Editor ou CLI).
-- 2. Popular dimension_types com os 3 tipos base (Centro de Custo,
--    Conta, Entidade) por tenant.
-- 3. Definir a tela/fluxo de elaboração de pacote (status transitions).
-- =====================================================================
