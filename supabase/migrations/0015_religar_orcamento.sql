-- =====================================================================
-- Religar Matriz/Pacotes/Realizado/Comparativo ao Orçamento — "próxima
-- etapa" deixada em aberto pela 0014_orcamento_conjunto_estrutura.sql.
--
-- Decidido com a usuária em 14/10:
--   - Ainda não há produção (só local/develop) — sem necessidade de
--     backfill de dado existente.
--   - Lançamentos sem orcamento_id (NULL) continuam existindo como um
--     "bucket" implícito de dado legado, em vez de serem migrados para
--     um Orçamento criado automaticamente.
--   - A seleção de "qual Orçamento está em uso" é um seletor global
--     persistente (não um filtro por tela) — ver OrcamentoSelector no
--     AdminHeader, guardado em user_preferences (mesmo mecanismo já
--     usado por sidebar_collapsed/locale).
--
-- Com o seletor global, a regra de produto passou a ser: só se pode
-- LANÇAR (criar/editar) valores em Matriz e Pacotes com um Orçamento
-- selecionado (ver Server Actions) — o bucket legado (orcamento_id
-- NULL) fica só de leitura. Isso evita o problema de NULL não contar
-- como "igual a si mesmo" numa unique constraint (duas linhas NULL no
-- mesmo tenant/ano/mês/conta/centro de custo/entidade não violariam a
-- constraint) — como nenhuma linha nova é escrita com orcamento_id
-- NULL a partir de agora, esse caso só existe para dado legado já
-- consolidado antes desta migration, que não muda.
--
-- Fora de escopo aqui: Realizado (expense_entries) continua sem
-- orcamento_id — é fato histórico, não uma versão orçamentária; só
-- passa a resolver a árvore de dimensões pelo mesmo Conjunto de
-- Estruturas do Orçamento selecionado (mudança só no código, ver
-- getDimensionTree em src/lib/dimensions/queries.ts), pra que
-- Comparativo consiga casar conta/centro de custo entre Orçado e
-- Realizado quando houver mais de uma Estrutura em uso.
-- =====================================================================

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
            and attname in (
                'tenant_id','year','month','cost_center_node_id',
                'account_node_id','entity_node_id','extra_dimensions'
            )
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
            unique (
                tenant_id, year, month, cost_center_node_id, account_node_id,
                entity_node_id, extra_dimensions, orcamento_id
            );
    end if;
end $$;
