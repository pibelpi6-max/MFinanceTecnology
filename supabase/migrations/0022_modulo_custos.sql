-- =====================================================================
-- Módulo de Custos (orçamento): ficha técnica dos produtos.
--
--   cost_inputs        -> cadastro de insumos (matéria-prima, embalagem,
--                         mão de obra) com unidade e custo unitário.
--   cost_recipes       -> ficha técnica de um produto no orçamento
--                         (rendimento por lote).
--   cost_recipe_items  -> composição da ficha: insumo, quantidade e perda %.
--
-- Serviços não têm ficha técnica (validado na aplicação).
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists cost_inputs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    code text not null check (length(btrim(code)) > 0),
    name text not null check (length(btrim(name)) > 0),
    kind text not null default 'materia_prima' check (kind in ('materia_prima','embalagem','mao_de_obra')),
    unit text not null default 'un',
    unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
    created_at timestamptz not null default now(),
    constraint cost_inputs_unique unique (tenant_id, code)
);

create table if not exists cost_recipes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    orcamento_id uuid not null references orcamentos(id) on delete cascade,
    product_node_id uuid not null references dimension_nodes(id) on delete cascade,
    yield_qty numeric(18,4) not null default 1 check (yield_qty > 0),
    updated_at timestamptz not null default now(),
    constraint cost_recipes_unique unique (tenant_id, orcamento_id, product_node_id)
);

create table if not exists cost_recipe_items (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    recipe_id uuid not null references cost_recipes(id) on delete cascade,
    input_id uuid not null references cost_inputs(id) on delete restrict,
    quantity numeric(18,4) not null default 0 check (quantity >= 0),
    loss_pct numeric(9,4) not null default 0 check (loss_pct >= 0 and loss_pct <= 100),
    sort_order int not null default 0
);

create index if not exists idx_cost_recipe_items_recipe on cost_recipe_items (tenant_id, recipe_id);
create index if not exists idx_cost_recipes_orc on cost_recipes (tenant_id, orcamento_id);

do $$
declare t text;
begin
    foreach t in array array['cost_inputs','cost_recipes','cost_recipe_items'] loop
        execute format('alter table %I enable row level security', t);
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
grant select, insert, update, delete on cost_inputs to authenticated;
grant select, insert, update, delete on cost_recipes to authenticated;
grant select, insert, update, delete on cost_recipe_items to authenticated;
