-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Sojourn — hybrid search (full-text + semantic embeddings)                 ║
-- ║                                                                            ║
-- ║  Adds pgvector embeddings to posts and photos plus a pair of RRF-based     ║
-- ║  hybrid-search RPCs that fuse PostgreSQL full-text ranking with vector     ║
-- ║  similarity. Photos become first-class search results, embedded from       ║
-- ║  their AI descriptions / captions / place names.                           ║
-- ║                                                                            ║
-- ║  Everything degrades gracefully: with a null query_embedding the RPCs      ║
-- ║  return pure full-text results, so search keeps working before a single    ║
-- ║  embedding exists (or when no embeddings provider is configured).          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- pgvector may live in `public` or `extensions` depending on how the project was
-- bootstrapped; keep both on the path so the `vector` type + operators resolve.
set search_path = public, extensions;
create extension if not exists vector;

-- ─── embedding columns (1536 dims = OpenAI text-embedding-3-small) ────────────
-- If you configure a model with a different dimensionality, change the vector
-- size here and re-run the backfill (/api/admin/ai/embeddings).
alter table public.posts  add column if not exists embedding   vector(1536);
alter table public.posts  add column if not exists embedded_at timestamptz;
alter table public.photos add column if not exists embedding   vector(1536);
alter table public.photos add column if not exists embedded_at timestamptz;

-- ─── photos: full-text vector over caption / place / alt / AI description ─────
alter table public.photos
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(caption, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(place_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ai_description, '')), 'C')
  ) stored;
create index if not exists photos_search_idx on public.photos using gin(search_tsv);

-- ─── ANN indexes for cosine vector similarity ────────────────────────────────
create index if not exists posts_embedding_idx
  on public.posts using hnsw (embedding vector_cosine_ops);
create index if not exists photos_embedding_idx
  on public.photos using hnsw (embedding vector_cosine_ops);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Reciprocal Rank Fusion (RRF) hybrid search                                 ║
-- ║                                                                            ║
-- ║  Each side (full-text, vector) produces a ranking; the fused score is the   ║
-- ║  sum of 1/(k + rank). A side is simply skipped when its signal is absent:   ║
-- ║  a blank query_text drops full-text, a null query_embedding drops vector.   ║
-- ║  Only published content is considered, so these are safe to expose to anon. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function public.search_posts_hybrid(
  query_text       text,
  query_embedding  vector(1536) default null,
  match_count      int default 24,
  rrf_k            int default 50
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
  rrf_k            int default 50
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

grant execute on function public.search_posts_hybrid(text, vector, int, int)
  to anon, authenticated, service_role;
grant execute on function public.search_photos_hybrid(text, vector, int, int)
  to anon, authenticated, service_role;
