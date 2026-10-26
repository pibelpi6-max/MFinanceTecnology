-- =====================================================================
-- Orçamentos: tipo (Orçamento, Revisão, Forecast, Cenário, Teste),
-- orçamento oficial do ano (estrela), descrição e novos status
-- (Em elaboração, Aprovado).
--
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

do $$
begin
    create type orcamento_tipo as enum ('orcamento', 'revisao', 'forecast', 'cenario', 'teste');
exception
    when duplicate_object then null;
end $$;

alter table orcamentos add column if not exists tipo orcamento_tipo not null default 'orcamento';
alter table orcamentos add column if not exists oficial boolean not null default false;
alter table orcamentos add column if not exists description text;

alter type orcamento_status add value if not exists 'em_elaboracao';
alter type orcamento_status add value if not exists 'aprovado';

-- No máximo 1 orçamento oficial por tenant e ano.
create unique index if not exists idx_orcamentos_um_oficial_por_ano
    on orcamentos (tenant_id, year)
    where oficial;
