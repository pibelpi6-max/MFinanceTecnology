-- =====================================================================
-- Área de Parâmetros (Configurações): gestão do período orçamentário
-- (mês de início do exercício) e gestão centralizada das dimensões
-- (nome/descrição dos tipos, criação de tipos personalizados).
--
-- Escopo definido em 29/09: esta migration guarda o mês de início do
-- exercício fiscal em `tenants.fiscal_year_start_month`, mas NÃO
-- reescreve a semântica de "ano" usada hoje pela Matriz/Realizado/
-- Comparativo (que continuam tratando o ano como ano civil, jan-dez).
-- Rewire desses três telas para considerar o mês de início fica para
-- uma entrega futura, dado o risco de regressão em telas já validadas
-- pela usuária — o valor fica salvo e disponível para quando isso for
-- endereçado.
-- =====================================================================

alter table tenants
    add column fiscal_year_start_month smallint not null default 1
        check (fiscal_year_start_month between 1 and 12);

alter table dimension_types
    add column description text;

-- ---------------------------------------------------------------------
-- Pegadinha adicional encontrada nesta revisão: `tenants` tem RLS
-- habilitado (0001_init.sql) mas nunca ganhou nenhuma policy — ou seja,
-- select/update na própria tabela tenants estava sendo negado por
-- padrão (mesmo com o GRANT de 0004_grants.sql). Não travava o app até
-- agora porque só era usada via embed (`user_tenant_roles -> tenants`)
-- e nunca era atualizada por um usuário comum. A tela de Parâmetros é a
-- primeira a precisar de update, o que expôs a lacuna.
-- ---------------------------------------------------------------------

create policy tenant_isolation_select on tenants
    for select using (id in (select auth_tenant_ids()));

-- Só admin do tenant altera parâmetros do sistema (reforça, em
-- profundidade, a checagem já feita na Server Action).
create policy tenant_isolation_update on tenants
    for update using (
        id in (
            select tenant_id from user_tenant_roles
            where user_id = auth.uid() and role = 'admin'
        )
    );
