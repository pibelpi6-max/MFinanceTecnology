-- Premissa de volume com base em outro orçamento (mesmo mês + percentual).
-- Idempotente.
alter table public.revenue_premises
  add column if not exists base_orcamento_id uuid references public.orcamentos(id) on delete set null;

alter table public.revenue_premises drop constraint if exists revenue_premises_base_check;
alter table public.revenue_premises
  add constraint revenue_premises_base_check check (base in ('entered', 'previous_month', 'other_budget'));
