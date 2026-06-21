-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Sojourn — hybrid search distance threshold                                ║
-- ║                                                                            ║
-- ║  The vector half of hybrid search returned its top-N nearest neighbours    ║
-- ║  with NO distance cut-off, so with a small corpus every query — even       ║
-- ║  nonsense like "laskdglasndgklnds" — matched every embedded row. Add an     ║
-- ║  optional `max_distance` (cosine) ceiling to the vector side; the app       ║
-- ║  passes ~0.73 (calibrated: nonsense distances ~0.83+, strong matches        ║
-- ║  ~0.5–0.7). Full-text still catches exact keyword hits above the ceiling.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

set search_path = public, extensions;

drop function if exists public.search_posts_hybrid(text, vector, int, int);
drop function if exists public.search_photos_hybrid(text, vector, int, int);

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
    select p.id,
           row_number() over (order by p.embedding <=> query_embedding) as rank
    from public.posts p
    where p.published
      and query_embedding is not null
      and p.embedding is not null
      and (max_distance is null or (p.embedding <=> query_embedding) <= max_distance)
    order by p.embedding <=> query_embedding
    limit 80
  )
  select coalesce(fts.id, vec.id) as id,
         (coalesce(1.0 / (rrf_k + fts.rank), 0.0)
          + coalesce(1.0 / (rrf_k + vec.rank), 0.0))::real as score
  from fts
  full outer join vec on fts.id = vec.id
  order by score desc
  limit match_count;
$$;

create or replace function public.search_photos_hybrid(
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
  pub as (
    select ph.id, ph.search_tsv, ph.embedding
    from public.photos ph
    join public.posts p on p.id = ph.post_id
    where p.published
  ),
  fts as (
    select pub.id,
           row_number() over (
             order by ts_rank_cd(pub.search_tsv, tsq.q) desc
           ) as rank
    from pub
    cross join tsq
    where tsq.q is not null
      and pub.search_tsv @@ tsq.q
    limit 80
  ),
  vec as (
    select pub.id,
           row_number() over (order by pub.embedding <=> query_embedding) as rank
    from pub
    where query_embedding is not null
      and pub.embedding is not null
      and (max_distance is null or (pub.embedding <=> query_embedding) <= max_distance)
    order by pub.embedding <=> query_embedding
    limit 80
  )
  select coalesce(fts.id, vec.id) as id,
         (coalesce(1.0 / (rrf_k + fts.rank), 0.0)
          + coalesce(1.0 / (rrf_k + vec.rank), 0.0))::real as score
  from fts
  full outer join vec on fts.id = vec.id
  order by score desc
  limit match_count;
$$;

grant execute on function public.search_posts_hybrid(text, vector, int, int, real)
  to anon, authenticated, service_role;
grant execute on function public.search_photos_hybrid(text, vector, int, int, real)
  to anon, authenticated, service_role;
