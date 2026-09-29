-- =====================================================================
-- Seed: primeiro tenant + tipos de dimensão base
-- Rodar no SQL Editor do Supabase, depois das migrations 0001 e 0002.
-- =====================================================================

-- 1. Tenant inicial (renomeie 'name'/'slug' como preferir depois)
insert into tenants (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Minha Empresa', 'minha-empresa');

-- 2. Os 3 tipos de dimensão base do Matrix
insert into dimension_types (tenant_id, code, name, is_system, sort_order)
values
    ('00000000-0000-0000-0000-000000000001', 'centro_custo', 'Centro de Custo', true, 1),
    ('00000000-0000-0000-0000-000000000001', 'conta',        'Conta',           true, 2),
    ('00000000-0000-0000-0000-000000000001', 'entidade',     'Entidade',        true, 3);
