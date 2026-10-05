-- =====================================================================
-- Workflow de aprovação de Pacotes ("pleito"): histórico de transições
-- de status (rascunho → em_elaboracao → submetido → aprovado/rejeitado),
-- com quem alterou, quando e um comentário opcional.
--
-- Escopo definido em 29/09: em vez de modelar "pleito" como uma entidade
-- própria (solicitações/ajustes individuais dentro de um pacote, como no
-- Gradus Matrix), a primeira versão trata o workflow como transições de
-- status do próprio budget_packages, com trilha de auditoria completa.
-- Se o conceito de "pleito" granular for necessário depois, esta tabela
-- vira a base do log e uma tabela de pleitos pode referenciá-la.
--
-- Rodar no SQL Editor do projeto Supabase (mesmo processo das migrations
-- anteriores).
-- =====================================================================

create table budget_package_status_history (
    id              uuid primary key default gen_random_uuid(),
    package_id      uuid not null references budget_packages(id) on delete cascade,
    from_status     package_status,              -- null na transição de criação
    to_status       package_status not null,
    comment         text,
    changed_by      uuid references profiles(id),
    created_at      timestamptz not null default now()
);

create index idx_pkg_status_history_package on budget_package_status_history (package_id, created_at desc);

alter table budget_package_status_history enable row level security;

create policy tenant_isolation_select on budget_package_status_history
    for select using (
        package_id in (select id from budget_packages where tenant_id in (select auth_tenant_ids()))
    );
create policy tenant_isolation_write on budget_package_status_history
    for insert with check (
        package_id in (select id from budget_packages where tenant_id in (select auth_tenant_ids()))
    );

grant select, insert on budget_package_status_history to authenticated;
