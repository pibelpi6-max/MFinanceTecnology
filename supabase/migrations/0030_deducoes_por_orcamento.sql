-- Deduções padrão e condições especiais passam a ser por Orçamento (que já tem ano).
-- Os cadastros atuais (da empresa toda) são copiados para cada orçamento existente.
-- Idempotente.

alter table revenue_deduction_defaults add column if not exists orcamento_id uuid references orcamentos(id) on delete cascade;
alter table revenue_deduction_rules add column if not exists orcamento_id uuid references orcamentos(id) on delete cascade;

alter table revenue_deduction_defaults drop constraint if exists revenue_deduction_defaults_unique;
alter table revenue_deduction_defaults drop constraint if exists revenue_deduction_defaults_unique_orc;
alter table revenue_deduction_defaults add constraint revenue_deduction_defaults_unique_orc unique (orcamento_id, label);

alter table revenue_deduction_rules drop constraint if exists revenue_deduction_rules_unique;
alter table revenue_deduction_rules drop constraint if exists revenue_deduction_rules_unique_orc;
alter table revenue_deduction_rules add constraint revenue_deduction_rules_unique_orc unique nulls not distinct (orcamento_id, label, entity_node_id, product_node_id);

insert into revenue_deduction_defaults (tenant_id, orcamento_id, label, pct, sort_order)
select d.tenant_id, o.id, d.label, d.pct, d.sort_order
from revenue_deduction_defaults d
join orcamentos o on o.tenant_id = d.tenant_id
where d.orcamento_id is null
on conflict do nothing;
delete from revenue_deduction_defaults where orcamento_id is null;

insert into revenue_deduction_rules (tenant_id, orcamento_id, label, entity_node_id, product_node_id, pct, sort_order)
select r.tenant_id, o.id, r.label, r.entity_node_id, r.product_node_id, r.pct, r.sort_order
from revenue_deduction_rules r
join orcamentos o on o.tenant_id = r.tenant_id
where r.orcamento_id is null
on conflict do nothing;
delete from revenue_deduction_rules where orcamento_id is null;

create index if not exists idx_revenue_deduction_defaults_orc on revenue_deduction_defaults (orcamento_id);
create index if not exists idx_revenue_deduction_rules_orc on revenue_deduction_rules (orcamento_id);
