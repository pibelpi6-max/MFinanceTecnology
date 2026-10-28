-- =====================================================================
-- Ordem manual dos itens de uma estrutura (arrastar para reordenar).
-- sort_order vale entre irmãos (mesmo pai); empate cai na ordem alfabética.
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

alter table dimension_nodes add column if not exists sort_order int not null default 0;
