-- A private snapshot of the last AI-generated draft for a post: the pristine
-- machine body (before the author edits posts.body), the outline plan, and
-- whether the homogenize pass fell back to the raw section concatenation.
--
-- Its OWN table (not columns on posts) BECAUSE anon holds table-level SELECT on
-- posts with a `published = true` read policy — RLS gates rows, not columns, so
-- any posts column is readable by the public API on a published post. This table
-- is fail-closed: RLS on, granted only to authenticated owners/editors, no anon
-- grant (per the 0027 "new tables closed by default" convention).
create table if not exists public.post_ai_drafts (
  post_id              uuid primary key references public.posts(id) on delete cascade,
  draft_body           text,
  outline              jsonb,
  homogenize_fell_back boolean,
  updated_at           timestamptz not null default now()
);

alter table public.post_ai_drafts enable row level security;

grant select, insert, update on public.post_ai_drafts to authenticated;

create policy "scoped read post_ai_drafts" on public.post_ai_drafts
  for select to authenticated
  using (public.is_owner() or public.can_edit_post(post_id));

create policy "scoped insert post_ai_drafts" on public.post_ai_drafts
  for insert to authenticated
  with check (public.is_owner() or public.can_edit_post(post_id));

create policy "scoped update post_ai_drafts" on public.post_ai_drafts
  for update to authenticated
  using (public.is_owner() or public.can_edit_post(post_id))
  with check (public.is_owner() or public.can_edit_post(post_id));
