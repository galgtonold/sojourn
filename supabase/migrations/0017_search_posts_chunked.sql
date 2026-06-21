-- Re-point the vector half of post search at post_chunks: a post's semantic
-- distance is now its SINGLE BEST-matching chunk (min cosine distance over its
-- chunks), not one vector over the whole post. Same signature as before, so the
-- app calls it unchanged. Full-text (post-level search_tsv) is unchanged.

set search_path = public, extensions;

drop function if exists public.search_posts_hybrid(text, vector, int, int, real);

create or replace function public.search_posts_hybrid(
  query_text       text,
  query_embedding  vector(1536) default null,
  match_count      int default 24,
  rrf_k            int default 50,
  max_distance     real default null
)
returns table (id uuid, score real)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with tsq as (
    select case
      when coalesce(btrim(query_text), '') = '' then null
      else websearch_to_tsquery('simple', query_text)
    end as q
  ),
  fts as (
    select p.id,
           row_number() over (
             order by ts_rank_cd(p.search_tsv, tsq.q) desc
           ) as rank
    from public.posts p
    cross join tsq
    where p.published
      and tsq.q is not null
      and p.search_tsv @@ tsq.q
    limit 80
  ),
  vec as (
    -- best (nearest) chunk per published post, optionally distance-gated
    select c.post_id as id,
           min(c.embedding <=> query_embedding) as dist
    from public.post_chunks c
    join public.posts p on p.id = c.post_id
    where p.published
      and query_embedding is not null
      and c.embedding is not null
      and (max_distance is null or (c.embedding <=> query_embedding) <= max_distance)
    group by c.post_id
  ),
  vecr as (
    select id, row_number() over (order by dist) as rank from vec
  )
  select coalesce(fts.id, vecr.id) as id,
         (coalesce(1.0 / (rrf_k + fts.rank), 0.0)
          + coalesce(1.0 / (rrf_k + vecr.rank), 0.0))::real as score
  from fts
  full outer join vecr on fts.id = vecr.id
  order by score desc
  limit match_count;
$$;

grant execute on function public.search_posts_hybrid(text, vector, int, int, real)
  to anon, authenticated, service_role;
