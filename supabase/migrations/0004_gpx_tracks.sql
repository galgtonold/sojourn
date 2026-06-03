-- GPX tracks, stored as parsed GeoJSON for direct map rendering.
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references public.posts(id) on delete cascade,
  trip_id     uuid references public.trips(id) on delete cascade,
  name        text,
  geojson     jsonb not null,
  distance_m  double precision,
  created_at  timestamptz not null default now()
);
create index if not exists tracks_post_idx on public.tracks(post_id);
create index if not exists tracks_trip_idx on public.tracks(trip_id);

alter table public.tracks enable row level security;
create policy "read tracks of published posts" on public.tracks
  for select using (
    trip_id is not null
    or exists (select 1 from public.posts p where p.id = tracks.post_id and p.published)
  );
create policy "admin all tracks" on public.tracks
  for all to authenticated using (true) with check (true);
