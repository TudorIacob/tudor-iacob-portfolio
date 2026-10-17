-- Read-only verification after running migrations/001_portfolio.sql.
-- Run the entire file in your Supabase project's SQL Editor.

-- Expected: vector extension in the extensions schema.
select e.extname, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'vector';

-- Expected: public.portfolio_chunks, with rls_enabled = true.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'portfolio_chunks';

-- Expected: id text, content text, metadata jsonb, embedding vector(1536).
select a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as column_type,
       a.attnotnull as not_null
from pg_attribute a
where a.attrelid = to_regclass('public.portfolio_chunks')
  and a.attnum > 0 and not a.attisdropped
order by a.attnum;

-- Expected: portfolio_embedding_idx using hnsw and vector_cosine_ops.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'portfolio_chunks'
  and indexname = 'portfolio_embedding_idx';

-- Expected: both RPCs, invoker security, service_role=true,
-- anon=false, authenticated=false for execution privileges.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('match_portfolio_chunks', 'replace_portfolio_index')
order by p.proname;

-- Expected: all true for service_role, all false for anon/authenticated.
select role_name,
       has_table_privilege(role_name, to_regclass('public.portfolio_chunks'), 'SELECT') as can_select,
       has_table_privilege(role_name, to_regclass('public.portfolio_chunks'), 'INSERT') as can_insert,
       has_table_privilege(role_name, to_regclass('public.portfolio_chunks'), 'UPDATE') as can_update,
       has_table_privilege(role_name, to_regclass('public.portfolio_chunks'), 'DELETE') as can_delete
from (values ('service_role'), ('anon'), ('authenticated')) roles(role_name);

-- Inspect function bodies without executing either RPC or modifying the index.
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('match_portfolio_chunks', 'replace_portfolio_index');
