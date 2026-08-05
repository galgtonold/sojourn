-- The deanonymisation leak 0043 closed on `comments`, still open on its two
-- siblings.
--
-- 0043 §5 revoked anon's table-level SELECT on `comments` and granted it back
-- column by column, because `visitor_token` is a stable per-browser identifier
-- and a table-level grant swept it up. `reactions` and `comment_likes` carry
-- the same column, from the same `sojourn:vid` value in the same localStorage
-- key, and were never given the same treatment — so
-- `?select=visitor_token,post_id,kind` still returns everything one browser
-- has ever reacted to, to anyone holding the public anon key.
--
-- That is the property readers assume they have on a personal journal, and it
-- becomes materially easier to notice the moment this repository is public and
-- `for select using (true)` is there to read in 0001.
--
-- ── why the writes move too ──────────────────────────────────────────────────
--
-- Column-scoping the SELECT alone BREAKS both features, which is not obvious
-- and was found by trying it: the app upserts with `on conflict (post_id, kind,
-- visitor_token) do nothing`, and Postgres requires SELECT on the arbiter
-- columns to resolve a conflict target. Revoke the column and every reaction
-- and like fails with 42501.
--
-- So the writes go the way 0046 sent the deletes: a security-definer function
-- that takes the token as an argument. anon then holds no direct DML on these
-- tables at all — no INSERT, no DELETE, and SELECT only on the columns that
-- are safe to read. The token is still accepted, still stored, still matched;
-- it just stops being readable back out.

-- ── reactions ────────────────────────────────────────────────────────────────

create or replace function public.add_reaction(
  p_post_id uuid,
  p_kind text,
  p_token text
) returns integer
language plpgsql
security definer
-- Pinned: a security-definer function that resolves names through the caller's
-- search_path can be aimed at a table of their choosing.
set search_path = public, pg_temp
as $$
declare
  added integer;
begin
  -- Same floor as remove_reaction in 0046. A blank token would collide with
  -- every other blank-token row and make the "did I react" state shared.
  if p_token is null or length(p_token) < 8 then
    return 0;
  end if;
  -- Unknown kinds are the caller's typo, not a row worth keeping. The check
  -- constraint would reject them anyway; failing quietly keeps the route's
  -- contract (200 with the current counts) rather than turning it into a 500.
  if p_kind is null or p_post_id is null then
    return 0;
  end if;

  insert into public.reactions (post_id, kind, visitor_token)
       values (p_post_id, p_kind, p_token)
  on conflict (post_id, kind, visitor_token) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.add_reaction(uuid, text, text) from public, anon, authenticated;
grant execute on function public.add_reaction(uuid, text, text) to anon, authenticated;

-- ── comment likes ────────────────────────────────────────────────────────────

create or replace function public.add_comment_like(
  p_comment_id uuid,
  p_token text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  added integer;
begin
  if p_token is null or length(p_token) < 8 or p_comment_id is null then
    return 0;
  end if;

  insert into public.comment_likes (comment_id, visitor_token)
       values (p_comment_id, p_token)
  on conflict (comment_id, visitor_token) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.add_comment_like(uuid, text) from public, anon, authenticated;
grant execute on function public.add_comment_like(uuid, text) to anon, authenticated;

-- ── close the direct paths ───────────────────────────────────────────────────
--
-- Revoked BY NAME as well as from PUBLIC: Supabase ships ALTER DEFAULT
-- PRIVILEGES granting on new objects in this schema to anon and authenticated,
-- and revoking from PUBLIC leaves those explicit grants untouched. 0047 learned
-- this the hard way — the function came back callable by anon on production.

revoke insert on public.reactions from anon;
revoke insert on public.comment_likes from anon;

-- The same treatment 0036 gave posts/trips and 0043 gave comments, and it fails
-- closed the same way: a column added to either table later is not anon-readable
-- until someone adds it here on purpose.
revoke select on public.reactions from anon;
grant select (id, post_id, kind, created_at) on public.reactions to anon;

revoke select on public.comment_likes from anon;
grant select (id, comment_id, created_at) on public.comment_likes to anon;

-- `authenticated` keeps table-level SELECT on both, for the same reason 0043
-- gave: RLS already scopes it, and moderation needs to group a visitor's
-- activity. It keeps INSERT too — the routes call the functions for everyone,
-- but an owner acting through the session client is inside the trust boundary
-- either way.
