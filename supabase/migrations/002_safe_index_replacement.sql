-- Apply to projects that already ran 001_portfolio.sql.
-- Supabase safe-update checks require an explicit DELETE predicate.
-- IDs are non-null primary keys; this intentionally replaces the dedicated index.
-- Defining this function does not delete data. Deletion occurs only on ingestion.
create or replace function public.replace_portfolio_index(records jsonb)
returns void language plpgsql security invoker set search_path = public, extensions as $$
begin
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) = 0 then
    raise exception 'An index must contain records';
  end if;
  perform pg_advisory_xact_lock(783102);
  delete from public.portfolio_chunks where id is not null;
  insert into public.portfolio_chunks(id, content, metadata, embedding)
  select r->>'id', r->>'content', r->'metadata', (r->>'embedding')::extensions.vector(1536)
  from jsonb_array_elements(records) r;
end;
$$;
revoke all on function public.replace_portfolio_index(jsonb) from public, anon, authenticated;
grant execute on function public.replace_portfolio_index(jsonb) to service_role;
