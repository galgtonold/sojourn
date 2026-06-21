-- Let the app pass a pre-built tsquery (with synonym/translation OR-groups) for
-- the full-text side, so "Fahrrad" can match posts that say "Rad"/"bike". When
-- ts_query is null the RPCs fall back to websearch_to_tsquery(query_text).

set search_path = public, extensions;

drop function if exists public.search_posts_hybrid(text, vector, int, int, real);
drop function if exists public.search_photos_hybrid(text, vector, int, int, real);

create or replace function public.search_posts_hybrid(
  query_text       text,
  query_embedding  vector(1536) default null,
  match_count      int default 24,
  rrf_k            int default 50,
  max_distance     real default null,
  ts_query         text default null
)
returns table (id uuid, score real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with tsq as (
    select case
      when nullif(btrim(coalesce(ts_query, '')), '') is not null
        then to_tsquery('simple', ts_query)
      when coalesce(btrim(query_text), '') = '' then null
      else websearch_to_tsquery('simple', query_text)
    end as q
  ),
  fts as (
    select p.id,
           row_number() over (order by ts_rank_cd(p.search_tsv, tsq.q) desc) as rank
    from public.posts p
    cross join tsq
    where p.published and tsq.q is not null and p.search_tsv @@ tsq.q
    limit 80
  ),
  vec as (
    select c.post_id as id, min(c.embedding <=> query_embedding) as dist
    from public.post_chunks c
    join public.posts p on p.id = c.post_id
    where p.published and query_embedding is not null and c.embedding is not null
      and (max_distance is null or (c.embedding <=> query_embedding) <= max_distance)
    group by c.post_id
  ),
  vecr as (select id, row_number() over (order by dist) as rank from vec)
  select coalesce(fts.id, vecr.id) as id,
         (coalesce(1.0 / (rrf_k + fts.rank), 0.0)
          + coalesce(1.0 / (rrf_k + vecr.rank), 0.0))::real as score
  from fts full outer join vecr on fts.id = vecr.id
  order by score desc
  limit match_count;
$$;

create or replace function public.search_photos_hybrid(
  query_text       text,
  query_embedding  vector(1536) default null,
  match_count      int default 24,
  rrf_k            int default 50,
  max_distance     real default null,
  ts_query         text default null
)
returns table (id uuid, score real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with tsq as (
    select case
      when nullif(btrim(coalesce(ts_query, '')), '') is not null
        then to_tsquery('simple', ts_query)
      when coalesce(btrim(query_text), '') = '' then null
      else websearch_to_tsquery('simple', query_text)
    end as q
  ),
  pub as (
    select ph.id, ph.search_tsv, ph.embedding
    from public.photos ph
    join public.posts p on p.id = ph.post_id
    where p.published
  ),
  fts as (
    select pub.id,
           row_number() over (order by ts_rank_cd(pub.search_tsv, tsq.q) desc) as rank
    from pub cross join tsq
    where tsq.q is not null and pub.search_tsv @@ tsq.q
    limit 80
  ),
  vec as (
    select pub.id,
           row_number() over (order by pub.embedding <=> query_embedding) as rank
    from pub
    where query_embedding is not null and pub.embedding is not null
      and (max_distance is null or (pub.embedding <=> query_embedding) <= max_distance)
    order by pub.embedding <=> query_embedding
    limit 80
  )
  select coalesce(fts.id, vec.id) as id,
         (coalesce(1.0 / (rrf_k + fts.rank), 0.0)
          + coalesce(1.0 / (rrf_k + vec.rank), 0.0))::real as score
  from fts full outer join vec on fts.id = vec.id
  order by score desc
  limit match_count;
$$;

grant execute on function public.search_posts_hybrid(text, vector, int, int, real, text)
  to anon, authenticated, service_role;
grant execute on function public.search_photos_hybrid(text, vector, int, int, real, text)
  to anon, authenticated, service_role;
