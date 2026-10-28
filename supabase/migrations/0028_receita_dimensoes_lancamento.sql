-- Hierarquias que cada venda carrega em um Orçamento (Receita > Lançamentos).
-- Vazio = detectar a partir dos lançamentos existentes (compatível com o legado).
alter table public.orcamentos
  add column if not exists revenue_dimension_type_ids uuid[] not null default '{}';
