-- =====================================================================
-- Árvore de navegação Entidade → Pacote na Matriz Orçamentária.
--
-- O treinamento do produto de referência (Matrix/Gradus) descreve o
-- Pacote como algo que vive "dentro" de uma Entidade — hoje
-- `budget_packages` só se relaciona com Centro de Custo (opcional).
-- Esta migration adiciona um vínculo opcional com Entidade, só para
-- permitir agrupar os pacotes na árvore da Matriz; pacotes existentes
-- (sem entidade) continuam funcionando normalmente e aparecem no
-- grupo "Outros pacotes" da árvore.
--
-- Escopo (definido em 29/09, junto com a usuária): esta entrega é só
-- navegação — a árvore ajuda a navegar/filtrar a Matriz por Entidade e
-- pular para os Pacotes daquela Entidade, mas os lançamentos da Matriz
-- ainda não ficam "presos" a um Pacote específico (isso — mesma célula
-- podendo ter um valor por Pacote — exigiria mudar a constraint única
-- de `matrix_budget_entries`, decisão maior que fica para depois).
-- =====================================================================

alter table budget_packages
    add column entity_node_id uuid references dimension_nodes(id);

create index idx_budget_packages_entity on budget_packages (tenant_id, year, entity_node_id);
