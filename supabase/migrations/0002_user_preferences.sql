-- =====================================================================
-- user_preferences — usado pelo DataTable (ordem/visibilidade de colunas,
-- largura, filtros, ordenação) reaproveitado do projeto "desenhe-app".
-- =====================================================================

create table user_preferences (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    key         text not null,
    value       jsonb not null,
    updated_at  timestamptz not null default now(),
    unique (user_id, key)
);

alter table user_preferences enable row level security;

create policy own_preferences_select on user_preferences
    for select using (user_id = auth.uid());
create policy own_preferences_upsert on user_preferences
    for insert with check (user_id = auth.uid());
create policy own_preferences_update on user_preferences
    for update using (user_id = auth.uid());
