-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Sojourn — passage (chunk) embeddings for posts                            ║
-- ║                                                                            ║
-- ║  Whole-post embeddings barely separate: a long narrative averages toward   ║
-- ║  the corpus centroid, so a short query sits ~equidistant from every post   ║
-- ║  (0.7–0.9). Instead embed each post as small CHUNKS — a distilled summary   ║
-- ║  (title+location+excerpt) plus body paragraphs, in each available language ║
-- ║  — and score a post by its single best-matching chunk. A query about       ║
-- ║  glaciers then matches the glacier passage at high similarity instead of    ║
-- ║  being diluted by the rest of the post.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

set search_path = public, extensions;
create extension if not exists vector;

create table if not exists public.post_chunks (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  locale      text not null,            -- 'de' | 'en' (which language variant)
  kind        text not null,            -- 'summary' | 'body'
  idx         int  not null,            -- order within (post, locale)
  content     text not null,
  embedding   vector(1536),
  embedded_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists post_chunks_post_idx on public.post_chunks(post_id);
create index if not exists post_chunks_embedding_idx
  on public.post_chunks using hnsw (embedding vector_cosine_ops);

alter table public.post_chunks enable row level security;

-- Anon may read chunks of published posts only (mirrors the posts policy); the
-- single authenticated admin manages them.
create policy "read chunks of published posts" on public.post_chunks
  for select using (
    exists (select 1 from public.posts p where p.id = post_chunks.post_id and p.published)
  );
create policy "admin all post_chunks" on public.post_chunks
  for all to authenticated using (true) with check (true);
