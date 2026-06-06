-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Collaborators: owner + per-trip members                                   ║
-- ║                                                                            ║
-- ║  Replaces the "any authenticated user = full admin" model. There is one    ║
-- ║  owner (full access + can invite). Members are granted specific trips and  ║
-- ║  may do everything within that scope (the trip, its posts and everything   ║
-- ║  attached to them) — but nothing outside it.                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ─── profiles: one row per auth user, with a coarse role ─────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

-- ─── trip_members: per-trip grants (owners need no rows; they see all) ────────
create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_idx on public.trip_members(user_id);

-- ─── predicates (security definer → bypass RLS, so policies don't recurse) ────
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.can_edit_trip(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select tid is not null and (
    public.is_owner()
    or exists (
      select 1 from public.trip_members
      where user_id = auth.uid() and trip_id = tid
    )
  );
$$;

create or replace function public.can_edit_post(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner()
    or exists (
      select 1
      from public.posts p
      join public.trip_members tm on tm.trip_id = p.trip_id
      where p.id = pid and tm.user_id = auth.uid()
    );
$$;

-- ─── bootstrap: existing users become owners (only the admin exists today) ────
insert into public.profiles (id, email, role)
select id, email, 'owner' from auth.users
on conflict (id) do update set role = 'owner';

-- New auth users get a member profile automatically.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS on the new tables ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.trip_members enable row level security;

create policy "read own or owner profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_owner());
create policy "owner manage profiles" on public.profiles
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "read own or owner memberships" on public.trip_members
  for select to authenticated using (user_id = auth.uid() or public.is_owner());
create policy "owner manage memberships" on public.trip_members
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Rewrite the old "admin all *" (any authenticated) policies into scoped    ║
-- ║  ones. Public/anon read policies are left untouched.                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- posts
drop policy if exists "admin all posts" on public.posts;
create policy "scoped read posts" on public.posts
  for select to authenticated
  using (public.is_owner() or public.can_edit_trip(trip_id));
create policy "scoped insert posts" on public.posts
  for insert to authenticated
  with check (public.is_owner() or public.can_edit_trip(trip_id));
create policy "scoped update posts" on public.posts
  for update to authenticated
  using (public.is_owner() or public.can_edit_post(id))
  with check (public.is_owner() or public.can_edit_trip(trip_id));
create policy "scoped delete posts" on public.posts
  for delete to authenticated
  using (public.is_owner() or public.can_edit_post(id));

-- trips (creating/deleting trips is owner-only; members may edit granted ones)
drop policy if exists "admin all trips" on public.trips;
create policy "owner insert trips" on public.trips
  for insert to authenticated with check (public.is_owner());
create policy "scoped update trips" on public.trips
  for update to authenticated
  using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
create policy "owner delete trips" on public.trips
  for delete to authenticated using (public.is_owner());

-- locations
drop policy if exists "admin all locations" on public.locations;
create policy "scoped write locations" on public.locations
  for all to authenticated
  using (public.is_owner()
    or (post_id is not null and public.can_edit_post(post_id))
    or (trip_id is not null and public.can_edit_trip(trip_id)))
  with check (public.is_owner()
    or (post_id is not null and public.can_edit_post(post_id))
    or (trip_id is not null and public.can_edit_trip(trip_id)));

-- photos
drop policy if exists "admin all photos" on public.photos;
create policy "scoped write photos" on public.photos
  for all to authenticated
  using (public.can_edit_post(post_id))
  with check (public.can_edit_post(post_id));

-- tracks
drop policy if exists "admin all tracks" on public.tracks;
create policy "scoped write tracks" on public.tracks
  for all to authenticated
  using (public.is_owner()
    or (post_id is not null and public.can_edit_post(post_id))
    or (trip_id is not null and public.can_edit_trip(trip_id)))
  with check (public.is_owner()
    or (post_id is not null and public.can_edit_post(post_id))
    or (trip_id is not null and public.can_edit_trip(trip_id)));

-- interactions
drop policy if exists "admin all interactions" on public.interactions;
create policy "scoped write interactions" on public.interactions
  for all to authenticated
  using (public.can_edit_post(post_id))
  with check (public.can_edit_post(post_id));

-- interaction_responses
drop policy if exists "admin all interaction_responses" on public.interaction_responses;
create policy "scoped interaction_responses" on public.interaction_responses
  for all to authenticated
  using (public.is_owner() or exists (
    select 1 from public.interactions i
    where i.id = interaction_responses.interaction_id
      and public.can_edit_post(i.post_id)))
  with check (public.is_owner() or exists (
    select 1 from public.interactions i
    where i.id = interaction_responses.interaction_id
      and public.can_edit_post(i.post_id)));

-- comments (moderation scoped to the post's trip)
drop policy if exists "admin read all comments" on public.comments;
drop policy if exists "admin manage comments" on public.comments;
drop policy if exists "admin delete comments" on public.comments;
create policy "scoped read comments" on public.comments
  for select to authenticated
  using (public.is_owner() or public.can_edit_post(post_id));
create policy "scoped update comments" on public.comments
  for update to authenticated
  using (public.is_owner() or public.can_edit_post(post_id))
  with check (public.is_owner() or public.can_edit_post(post_id));
create policy "scoped delete comments" on public.comments
  for delete to authenticated
  using (public.is_owner() or public.can_edit_post(post_id));

-- push subscriptions & notifications: owner-only
drop policy if exists "admin push" on public.push_subscriptions;
create policy "owner push" on public.push_subscriptions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "admin notifications" on public.notifications;
create policy "owner notifications" on public.notifications
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
