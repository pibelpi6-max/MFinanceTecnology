-- =====================================================================
-- Eixos extras na Matriz Orçamentária.
--
-- Decisão de produto (04/10): a usuária marca, no cadastro de cada
-- dimensão (Parâmetros > Dimensões, PR #20), em quais módulos ela é
-- válida. Esta migration dá significado a essa marcação para a Matriz
-- Orçamentária: a usuária escolhe (novo campo tenants.matriz_module_id,
-- configurável em Parâmetros) QUAL módulo fornece os eixos extras da
-- Matriz, e toda dimensão marcada nesse módulo (exceto conta/
-- centro_custo/entidade, que já são eixos fixos) vira um SELETOR extra
-- na tela — mesmo padrão já usado pela Entidade hoje: um filtro que
-- recorta qual combinação de lançamentos está sendo editada, não uma
-- 4ª coluna simultânea no grid (Centro de Custo × Conta continua sendo
-- o grid em si).
--
-- Decisão de modelagem: os valores extras ficam num jsonb
-- (extra_dimensions, formato {"<dimension_type_id>": "<dimension_node_id>"})
-- em vez de uma tabela de associação separada ou um array ordenado —
-- jsonb normaliza a ordem das chaves internamente, então a igualdade
-- (usada tanto na unique constraint quanto no ON CONFLICT/filtro de
-- leitura) não depende da ordem em que as dimensões foram inseridas no
-- objeto, ao contrário de um array (cuja ordem teria que ser mantida
-- canônica manualmente, e quebraria se a usuária reordenasse as
-- dimensões depois). Tenants que não configurarem matriz_module_id
-- continuam com extra_dimensions sempre '{}', ou seja, comportamento
-- idêntico ao de hoje — migration 100% retrocompatível com os dados já
-- existentes.
--
-- Fora de escopo aqui (ver tasks de acompanhamento): importação de
-- Matriz via planilha ainda não coleta valores de eixo extra (todo
-- lançamento importado cai em extra_dimensions = '{}'); Despesas
-- Realizadas e o comparativo Orçado x Realizado ainda não têm o mesmo
-- mecanismo.
-- =====================================================================

alter table tenants
    add column matriz_module_id uuid references modules(id) on delete set null;

alter table matrix_budget_entries
    add column extra_dimensions jsonb not null default '{}'::jsonb;

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

alter table matrix_budget_entries
    add constraint matrix_budget_entries_unique_entry
    unique (tenant_id, year, month, cost_center_node_id, account_node_id, entity_node_id, extra_dimensions);
