-- Anyone could delete everyone's reactions and likes.
--
-- Both tables carried `for delete using (true)`. The app always scoped its own
-- deletes to the caller's `visitor_token`, so nothing misbehaved in practice —
-- but the anon key is public by design, and a policy of `true` means one curl
-- loop empties every reaction and every comment like on the site. There is no
-- undo for that and no record of who did it.
--
-- Scoping it in the POLICY is not possible: the token lives in the visitor's
-- browser, and Postgres has no claim to compare it against. So the privilege is
-- removed from anon entirely and handed to two security-definer functions that
-- take the token as an argument and can therefore only ever delete a row that
-- matches it. The constraint now lives in the database rather than in a
-- `.match()` a future edit could drop.

-- ── reactions ────────────────────────────────────────────────────────────────

drop policy if exists "remove own reaction" on public.reactions;

create or replace function public.remove_reaction(
  p_post_id uuid,
  p_kind text,
  p_token text
) returns integer
language plpgsql
security definer
-- Pinned, because a security-definer function that resolves names through the
-- caller's search_path can be aimed at a table of their choosing.
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  -- A blank token would otherwise match every row whose token is blank.
  if p_token is null or length(p_token) < 8 then
    return 0;
  end if;
  delete from public.reactions
   where post_id = p_post_id and kind = p_kind and visitor_token = p_token;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.remove_reaction(uuid, text, text) from public;
grant execute on function public.remove_reaction(uuid, text, text) to anon, authenticated;

-- ── comment likes ────────────────────────────────────────────────────────────

drop policy if exists "remove own like" on public.comment_likes;

create or replace function public.remove_comment_like(
  p_comment_id uuid,
  p_token text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  if p_token is null or length(p_token) < 8 then
    return 0;
  end if;
  delete from public.comment_likes
   where comment_id = p_comment_id and visitor_token = p_token;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.remove_comment_like(uuid, text) from public;
grant execute on function public.remove_comment_like(uuid, text) to anon, authenticated;

-- Belt and braces: with the policies gone, RLS already denies every delete to
-- anon. Revoking the table privilege as well means a future migration that adds
-- a permissive policy by accident still cannot hand the ability back silently.
revoke delete on public.reactions from anon;
revoke delete on public.comment_likes from anon;
