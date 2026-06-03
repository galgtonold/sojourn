-- Alt text for accessibility/SEO
alter table public.posts add column if not exists cover_alt text;
alter table public.photos add column if not exists alt text;

-- Likes on individual comments (one per visitor per comment)
create table if not exists public.comment_likes (
  id            uuid primary key default gen_random_uuid(),
  comment_id    uuid not null references public.comments(id) on delete cascade,
  visitor_token text not null,
  created_at    timestamptz not null default now(),
  unique (comment_id, visitor_token)
);
create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

alter table public.comment_likes enable row level security;
create policy "read comment likes" on public.comment_likes
  for select using (true);
create policy "anyone can like" on public.comment_likes
  for insert to anon, authenticated with check (true);
create policy "remove own like" on public.comment_likes
  for delete to anon, authenticated using (true);

-- Allow the authenticated admin to read hidden comments (for moderation).
create policy "admin read all comments" on public.comments
  for select to authenticated using (true);
