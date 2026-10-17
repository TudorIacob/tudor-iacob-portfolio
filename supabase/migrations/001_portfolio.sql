create extension if not exists vector with schema extensions;

create table if not exists public.portfolio_chunks (
  id text primary key,
  content text not null,
  metadata jsonb not null,
  embedding extensions.vector(1536) not null
);
alter table public.portfolio_chunks enable row level security;
revoke all on public.portfolio_chunks from anon, authenticated;
grant all on public.portfolio_chunks to service_role;
create index if not exists portfolio_embedding_idx on public.portfolio_chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_portfolio_chunks(query_embedding extensions.vector(1536), match_count integer default 5, match_threshold float default 0.35)
returns table(id text, content text, metadata jsonb, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select id, content, metadata, 1 - (embedding <=> query_embedding) as similarity
  from public.portfolio_chunks
  where 1 - (embedding <=> query_embedding) >= match_threshold
  order by embedding <=> query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

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
revoke all on function public.match_portfolio_chunks(extensions.vector, integer, float) from public, anon, authenticated;
revoke all on function public.replace_portfolio_index(jsonb) from public, anon, authenticated;
grant execute on function public.match_portfolio_chunks(extensions.vector, integer, float) to service_role;
grant execute on function public.replace_portfolio_index(jsonb) to service_role;
