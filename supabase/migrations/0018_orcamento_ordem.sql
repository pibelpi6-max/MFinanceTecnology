-- =====================================================================
-- Orçamentos: ordem manual dentro do ano (arrastar e soltar na linha
-- do tempo). Novos orçamentos entram no fim (default alto); ao
-- reordenar, a tela renumera 0..n-1.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

alter table orcamentos add column if not exists sort_order int not null default 1000000;

-- Ordem inicial: oficial primeiro, depois por criação (só para quem ainda não foi ordenado).
with ranked as (
    select id,
           row_number() over (partition by tenant_id, year order by oficial desc, created_at) - 1 as rn
    from orcamentos
    where sort_order = 1000000
)
update orcamentos o set sort_order = r.rn from ranked r where o.id = r.id;
