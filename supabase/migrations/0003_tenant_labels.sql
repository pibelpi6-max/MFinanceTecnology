create table tenant_labels (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    label_key   text not null,
    values      jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now(),
    unique (tenant_id, label_key)
);

alter table tenant_labels enable row level security;

create policy tenant_isolation_select on tenant_labels
    for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on tenant_labels
    for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on tenant_labels
    for update using (tenant_id in (select auth_tenant_ids()));
