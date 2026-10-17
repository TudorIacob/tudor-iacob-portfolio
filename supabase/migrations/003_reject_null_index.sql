-- Prevent a SQL NULL or JSON null payload from deleting the dedicated index.
-- Invalid payloads must fail before the advisory lock and DELETE.
create or replace function public.replace_portfolio_index(records jsonb)
returns void language plpgsql security invoker set search_path = public, extensions as $$
begin
  if records is null or jsonb_typeof(records) is distinct from 'array' then
    raise exception 'An index must be an array';
  end if;
  if jsonb_array_length(records) = 0 then
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
