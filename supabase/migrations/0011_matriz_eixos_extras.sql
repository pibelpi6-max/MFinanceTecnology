-- =====================================================================
-- Eixos extras na Matriz Orçamentária — versão simplificada (04/10).
--
-- Esta migration substitui a abordagem anterior (ainda não publicada
-- para as usuárias, só tinha sido rodada a parte de "Módulos" em
-- 0010_modulos.sql) por algo mais direto, depois de feedback da
-- usuária: nada de módulos/indireção — ela só quer marcar, na própria
-- tela de edição da dimensão, um checkbox "Usar na Matriz Orçamentária".
--
-- Por isso esta migration:
--   1) desfaz 0010_modulos.sql (dropa `dimension_type_modules` e
--      `modules` — essas tabelas chegaram a ser criadas no banco real,
--      mas nunca tiveram uso de verdade pela usuária). `tenants` também
--      chegou a ganhar a coluna `matriz_module_id` (fk para `modules`)
--      numa rodada anterior desta mesma migration ainda em rascunho —
--      por isso ela é derrubada primeiro, senão o `drop table modules`
--      falha com "cannot drop table modules because other objects
--      depend on it" (a fk `tenants_matriz_module_id_fkey`);
--   2) adiciona `dimension_types.use_in_matriz boolean`, a nova fonte
--      de verdade de "esta dimensão é um eixo extra da Matriz";
--   3) mantém o mecanismo de `extra_dimensions` em
--      `matrix_budget_entries` (jsonb + unique constraint) tal como
--      desenhado originalmente — essa parte continua correta: cada
--      dimensão marcada vira um SELETOR extra na tela (mesmo padrão já
--      usado pela Entidade hoje), não uma 4ª coluna simultânea no grid.
--
-- Decisão de modelagem (mantida): os valores extras ficam num jsonb
-- (extra_dimensions, formato {"<dimension_type_id>": "<dimension_node_id>"})
-- em vez de uma tabela de associação separada ou um array ordenado —
-- jsonb normaliza a ordem das chaves internamente, então a igualdade
-- (usada tanto na unique constraint quanto no ON CONFLICT/filtro de
-- leitura) não depende da ordem em que as dimensões foram inseridas no
-- objeto. Tenants sem nenhuma dimensão marcada continuam com
-- extra_dimensions sempre '{}', ou seja, comportamento idêntico ao de
-- hoje — migration 100% retrocompatível com os dados já existentes.
--
-- Fora de escopo aqui (ver tasks de acompanhamento): importação de
-- Matriz via planilha ainda não coleta valores de eixo extra (todo
-- lançamento importado cai em extra_dimensions = '{}'); Despesas
-- Realizadas e o comparativo Orçado x Realizado ainda não têm o mesmo
-- mecanismo.
-- =====================================================================

alter table tenants drop column if exists matriz_module_id;
drop table if exists dimension_type_modules;
drop table if exists modules;

alter table dimension_types
    add column if not exists use_in_matriz boolean not null default false;

alter table matrix_budget_entries
    add column if not exists extra_dimensions jsonb not null default '{}'::jsonb;

-- A unique constraint original (ver 0001_init.sql) não considerava
-- extra_dimensions -- sem trocar ela, duas combinações diferentes de
-- eixo extra para a mesma conta/centro de custo/entidade/mês seriam
-- tratadas como conflito (a 2ª sobrescreveria a 1ª). O nome dessa
-- constraint é autogerado pelo Postgres a partir da lista de colunas
-- declaradas inline em 0001_init.sql -- em vez de arriscar adivinhar
-- esse nome, o bloco abaixo descobre ele dinamicamente (comparando o
-- CONJUNTO de colunas da constraint, não uma string de nome) antes de
-- substituir.
do $$
declare
    old_conname text;
begin
    select con.conname into old_conname
    from pg_constraint con
    where con.conrelid = 'matrix_budget_entries'::regclass
      and con.contype = 'u'
      and (
          select array_agg(x order by x) from unnest(con.conkey) x
      ) = (
          select array_agg(attnum order by attnum)
          from pg_attribute
          where attrelid = 'matrix_budget_entries'::regclass
            and attname in ('tenant_id','year','month','cost_center_node_id','account_node_id','entity_node_id')
      );

    if old_conname is not null then
        execute format('alter table matrix_budget_entries drop constraint %I', old_conname);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'matrix_budget_entries_unique_entry'
          and conrelid = 'matrix_budget_entries'::regclass
    ) then
        alter table matrix_budget_entries
            add constraint matrix_budget_entries_unique_entry
            unique (tenant_id, year, month, cost_center_node_id, account_node_id, entity_node_id, extra_dimensions);
    end if;
end $$;
