-- "Utilizado em" na dimensão: quais hierarquias a Receita carrega (antes definido por orçamento).
-- Idempotente.
alter table dimension_types add column if not exists use_in_receita boolean not null default false;

-- Preserva o que já estava escolhido nos orçamentos (união das hierarquias carregadas).
update dimension_types dt
set use_in_receita = true
where exists (
  select 1 from orcamentos o
  where o.tenant_id = dt.tenant_id
    and dt.id = any (o.revenue_dimension_type_ids)
);
