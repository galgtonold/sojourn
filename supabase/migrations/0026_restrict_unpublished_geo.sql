-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Security (S2): stop leaking the geo of UNPUBLISHED trips.                ║
-- ║                                                                          ║
-- ║  The public read policies on `locations` and `tracks` used               ║
-- ║  `using ( trip_id is not null or <post is published> )`. The first       ║
-- ║  branch made ANY row carrying a trip_id world-readable via PostgREST,    ║
-- ║  regardless of whether its post (or any post in the trip) was published  ║
-- ║  — so map pins and full GPX route geometry for DRAFT entries leaked to   ║
-- ║  anonymous visitors. Gate the trip branch on the trip actually having a  ║
-- ║  published post, so a draft-only trip exposes nothing. Post-attached     ║
-- ║  rows stay visible exactly when their post is published, as before.      ║
-- ╚════════════════════════════════════════════════════════════════════════╝

drop policy if exists "read locations of published posts" on public.locations;
create policy "read locations of published posts" on public.locations
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = locations.post_id and p.published
    )
    or (
      trip_id is not null and exists (
        select 1 from public.posts p
        where p.trip_id = locations.trip_id and p.published
      )
    )
  );

drop policy if exists "read tracks of published posts" on public.tracks;
create policy "read tracks of published posts" on public.tracks
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = tracks.post_id and p.published
    )
    or (
      trip_id is not null and exists (
        select 1 from public.posts p
        where p.trip_id = tracks.trip_id and p.published
      )
    )
  );
