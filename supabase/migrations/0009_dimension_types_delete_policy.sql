-- dimension_types nunca recebeu uma policy de RLS para "delete" (0001_init.sql
-- só criou select/insert/update, mesmo padrão de lacuna já corrigido em outras
-- tabelas na 0006). Sem essa policy, um DELETE bloqueado pelo RLS não retorna
-- erro nenhum (o Supabase simplesmente afeta 0 linhas) -- por isso o botão
-- "Excluir" de uma dimensão personalizada parecia funcionar (sem erro na tela)
-- mas o contador "Personalizadas X/10" nunca diminuía: a linha nunca era
-- realmente apagada no banco.

create policy tenant_isolation_delete on dimension_types
    for delete using (tenant_id in (select auth_tenant_ids()));
