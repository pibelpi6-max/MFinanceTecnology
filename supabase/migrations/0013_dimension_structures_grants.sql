-- =====================================================================
-- GRANT que faltou na migration 0012_dimension_structures.sql.
--
-- RLS + policies não bastam: o Postgres também exige GRANT explícito na
-- tabela para o role "authenticated", senão o acesso é negado antes
-- mesmo de a policy ser avaliada (erro 42501 "permission denied for
-- table dimension_structures") — ver nota em 0004_grants.sql, que faz
-- o mesmo para as tabelas originais; toda migration que cria tabela
-- nova desde então repete esse grant (ver 0005 e 0010).
-- =====================================================================

grant select, insert, update, delete on dimension_structures to authenticated;
