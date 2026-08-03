-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Four places that treated "signed in" as "allowed". It never was.       ║
-- ║                                                                          ║
-- ║  0006 established the rule this project actually runs on: capability     ║
-- ║  comes from a row in `profiles`, read through is_owner() / can_edit_*(). ║
-- ║  It rewrote every `admin all *` policy on the public tables to match.    ║
-- ║  Three things it did not reach, and one thing added afterwards, still    ║
-- ║  grant power to the bare `authenticated` role — which, until this        ║
-- ║  migration, ANY STRANGER COULD OBTAIN by posting to /auth/v1/signup with ║
-- ║  the anon key printed in every page.                                     ║
-- ║                                                                          ║
-- ║  Found while auditing the repository before making it public. None of    ║
-- ║  these is created by publishing the source — the anon key and every      ║
-- ║  endpoint were already reachable. What publishing removes is the effort  ║
-- ║  of finding them.                                                        ║
-- ╚════════════════════════════════════════════════════════════════════════╝


-- ─── 1. Self-signup no longer produces a usable account ─────────────────────
--
-- `handle_new_user` (0006) inserted a `member` profile for every row that
-- landed in auth.users, whatever put it there. Combined with Supabase's
-- default `enable_signup = true`, that meant a stranger could mint themselves
-- the exact profile the rest of the schema trusts.
--
-- The trigger turns out to be dead weight for both legitimate paths, which is
-- what makes dropping it safe rather than brave — each already writes the
-- profile explicitly with the service role:
--
--   first-run claim   /api/setup      upsert({ role: 'owner' })
--   owner adds member /api/admin/members  upsert({ role: 'member' })
--
-- So after this, an account created by any route the app does not control gets
-- an auth session and NO profile — and with the rest of this migration, a
-- session without a profile can do nothing at all.
--
-- Turning signups off in the Supabase dashboard is still the right first move
-- and the README now says so. This is the part that does not depend on
-- remembering: configuration is not enforcement.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();


-- ─── 2. The photo bucket stops belonging to everyone ────────────────────────
--
-- 0001 scoped the three storage write policies by `bucket_id = 'photos'` and
-- nothing else, `to authenticated`. 0006's header says it rewrites the "any
-- authenticated" policies; storage.objects was simply missed, and no migration
-- has touched it since.
--
-- The consequence was not subtle: anyone holding a session could delete every
-- photo on the site, silently replace a cover image, or park arbitrary files
-- on the operator's public *.supabase.co origin. Object paths are enumerable —
-- every published photo URL is in the page HTML.
--
-- Insert stays open to collaborators because that is the job: a member granted
-- a trip uploads photos to it. Update and delete narrow to the owner, because
-- overwriting and destroying other people's media is curation, not authoring.
drop policy if exists "admin write photos bucket" on storage.objects;
drop policy if exists "admin update photos bucket" on storage.objects;
drop policy if exists "admin delete photos bucket" on storage.objects;

create policy "owner or member upload photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (
      public.is_owner()
      or exists (select 1 from public.trip_members tm where tm.user_id = auth.uid())
    )
  );

create policy "owner replace photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_owner())
  with check (bucket_id = 'photos' and public.is_owner());

create policy "owner delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_owner());

-- "public read photos bucket" (0001) is deliberately left alone: the bucket is
-- public by design and the photos in it are published content.


-- ─── 3. Unpublished trips stop being public ─────────────────────────────────
--
-- `read trips` has been `using (true)` since 0001 and was never narrowed —
-- `trips` has no `published` column, so every trip the operator ever started
-- was world-readable: title, summary, slug, dates, cover. For a journal whose
-- author writes ahead of publishing, the trip list is a plan of where they are
-- going next.
--
-- A trip is public exactly when something published points at it. Owners and
-- the trip's own editors keep full read access — this is the only SELECT policy
-- on trips, so without that second policy the admin would go blind.
--
-- TWO policies rather than one OR'd expression, and the reason is load-bearing:
-- 0007 revoked EXECUTE on is_owner() and can_edit_trip() from anon. A single
-- policy naming them is evaluated for every role, so anon hit "permission denied
-- for function is_owner" and could read NO trips at all — taking out the public
-- trips page and the home page with it. Written as two, the editor branch is
-- scoped `to authenticated` and anon never evaluates it. Policies for the same
-- command are OR'd, so the result is what the one-liner meant to say.
--
-- (Caught by impersonating anon against a freshly reset database. Nothing in the
-- test suite would have noticed, because none of it runs as a Postgres role.)
drop policy if exists "read trips" on public.trips;
create policy "read published trips" on public.trips
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.trip_id = trips.id and p.published
    )
  );

create policy "editors read every trip" on public.trips
  for select to authenticated
  using (public.is_owner() or public.can_edit_trip(id));


-- ─── 4. Draft geometry stops riding out on a published sibling ──────────────
--
-- 0026 closed the direct leak — a track is readable when its post is published
-- — and then OR-ed in a second branch for trip-level rows. But the editor
-- writes BOTH keys on every track (`track-manager.tsx` inserts post_id and
-- trip_id together), so the trip branch matched for tracks belonging to
-- unpublished posts as long as any sibling post in that trip was published.
--
-- The result was metre-accurate routes with timestamps for entries the author
-- had not published yet — which is exactly the live-location leak 0026 was
-- written to prevent, reintroduced by the OR.
--
-- The branches are now mutually exclusive: a row that names a post is judged on
-- that post, and only a row with no post falls back to the trip.
drop policy if exists "read tracks of published posts" on public.tracks;
create policy "read tracks of published posts" on public.tracks
  for select using (
    case
      when post_id is not null then exists (
        select 1 from public.posts p where p.id = tracks.post_id and p.published
      )
      else trip_id is not null and exists (
        select 1 from public.posts p where p.trip_id = tracks.trip_id and p.published
      )
    end
  );

drop policy if exists "read locations of published posts" on public.locations;
create policy "read locations of published posts" on public.locations
  for select using (
    case
      when post_id is not null then exists (
        select 1 from public.posts p where p.id = locations.post_id and p.published
      )
      else trip_id is not null and exists (
        select 1 from public.posts p where p.trip_id = locations.trip_id and p.published
      )
    end
  );


-- ─── 5. Readers stop being deanonymisable by anyone who asks ────────────────
--
-- 0020 granted anon table-level SELECT on everything; 00271 revoked only the
-- write verbs; 0036 column-scoped `posts` and `trips` but not `comments`. Then
-- 0028 added `comments.visitor_token` — a stable per-browser identifier — and
-- the table-level grant swept it up.
--
-- So `?select=visitor_token,author_name` returned the means to correlate every
-- comment one person had ever left, including ones written under different
-- display names. On a personal travel journal that is precisely the property
-- readers assume they have.
--
-- Same treatment 0036 gave the other two tables, and it fails closed the same
-- way: a column added to `comments` later is not anon-readable until someone
-- adds it here on purpose.
revoke select on public.comments from anon;
grant select (
  id, post_id, parent_id, author_name, body, hidden, created_at
) on public.comments to anon;

-- `authenticated` keeps table-level SELECT: RLS already scopes it, and the
-- moderation UI needs the token to group a commenter's history.
