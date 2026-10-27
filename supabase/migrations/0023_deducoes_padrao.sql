-- =====================================================================
-- Receita: deduções padrão da empresa (ICMS, PIS, COFINS, ISS...).
-- Cada linha é um atalho com o percentual padrão, que aparece ao editar
-- um produto ou serviço. Não é por produto: o valor de cada item continua
-- em revenue_deductions.
-- Idempotente: pode ser rodada mais de uma vez.
-- =====================================================================

create table if not exists revenue_deduction_defaults (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    label text not null check (length(btrim(label)) > 0),
    pct numeric(9,4) not null default 0 check (pct >= 0 and pct <= 100),
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    constraint revenue_deduction_defaults_unique unique (tenant_id, label)
);

alter table revenue_deduction_defaults enable row level security;

drop policy if exists tenant_isolation_select on revenue_deduction_defaults;
drop policy if exists tenant_isolation_write on revenue_deduction_defaults;
drop policy if exists tenant_isolation_update on revenue_deduction_defaults;
drop policy if exists tenant_isolation_delete on revenue_deduction_defaults;
create policy tenant_isolation_select on revenue_deduction_defaults for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_write on revenue_deduction_defaults for insert with check (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_update on revenue_deduction_defaults for update using (tenant_id in (select auth_tenant_ids()));
create policy tenant_isolation_delete on revenue_deduction_defaults for delete using (tenant_id in (select auth_tenant_ids()));

-- Sem GRANT explícito o Supabase nega o acesso mesmo com RLS (ver 0004_grants.sql).
grant select, insert, update, delete on revenue_deduction_defaults to authenticated;
