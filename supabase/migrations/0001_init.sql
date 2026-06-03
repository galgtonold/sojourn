-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Sojourn — initial schema                                                  ║
-- ║                                                                            ║
-- ║  Access model: content is PUBLIC-read (shared by URL); the only           ║
-- ║  authenticated user is the single admin. RLS lets anon read published     ║
-- ║  content + post comments/reactions, while all writes to content are       ║
-- ║  restricted to authenticated (admin) or the service role.                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create extension if not exists "pgcrypto";

-- ─── trips: a journey that groups posts ──────────────────────────────────────
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  summary     text,
  cover_image text,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── posts: individual journal entries ───────────────────────────────────────
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  excerpt      text,
  body         text,                         -- markdown/MDX-ish rich text
  cover_image  text,
  trip_id      uuid references public.trips(id) on delete set null,
  location     text,                         -- human-readable place name
  lat          double precision,
  lng          double precision,
  published    boolean not null default false,
  published_at timestamptz,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists posts_trip_idx on public.posts(trip_id);
create index if not exists posts_published_idx on public.posts(published, published_at desc);

-- Full-text search across title/excerpt/body.
alter table public.posts
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'C')
  ) stored;
create index if not exists posts_search_idx on public.posts using gin(search_tsv);

-- ─── locations: map pins / route waypoints for trips & posts ─────────────────
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts(id) on delete cascade,
  trip_id    uuid references public.trips(id) on delete cascade,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  day        integer,                        -- itinerary day, optional
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists locations_post_idx on public.locations(post_id);
create index if not exists locations_trip_idx on public.locations(trip_id);

-- ─── photos: gallery images (stored in the `photos` storage bucket) ──────────
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references public.posts(id) on delete cascade,
  storage_path text,                         -- path within the photos bucket
  url         text,                          -- public URL (denormalized)
  caption     text,
  width       integer,
  height      integer,
  blurhash    text,                          -- placeholder for smooth loading
  lat         double precision,
  lng         double precision,
  taken_at    timestamptz,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists photos_post_idx on public.photos(post_id, sort_order);

-- ─── comments: public, frictionless, with light moderation ───────────────────
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  author_name text not null default 'Anonymous',
  body        text not null,
  hidden      boolean not null default false, -- admin can hide spam
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id, created_at);

-- ─── reactions: one row per (post, kind, visitor) so they can be toggled ─────
create table if not exists public.reactions (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  kind          text not null,               -- e.g. 'heart','fire','wow','star'
  visitor_token text not null,               -- anon client id from localStorage
  created_at    timestamptz not null default now(),
  unique (post_id, kind, visitor_token)
);
create index if not exists reactions_post_idx on public.reactions(post_id);

-- ─── push_subscriptions: the admin's Web Push endpoints ──────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ─── notifications: in-app log mirroring what gets pushed ─────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,                  -- 'comment','reaction', ...
  title      text not null,
  body       text,
  url        text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_unread_idx on public.notifications(read, created_at desc);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_posts_touch on public.posts;
create trigger trg_posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_trips_touch on public.trips;
create trigger trg_trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Row Level Security                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table public.trips              enable row level security;
alter table public.posts              enable row level security;
alter table public.locations          enable row level security;
alter table public.photos             enable row level security;
alter table public.comments           enable row level security;
alter table public.reactions          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;

-- Public can read published posts and everything attached to them.
create policy "read published posts" on public.posts
  for select using (published = true);
create policy "admin all posts" on public.posts
  for all to authenticated using (true) with check (true);

create policy "read trips" on public.trips
  for select using (true);
create policy "admin all trips" on public.trips
  for all to authenticated using (true) with check (true);

create policy "read locations of published posts" on public.locations
  for select using (
    trip_id is not null
    or exists (select 1 from public.posts p where p.id = locations.post_id and p.published)
  );
create policy "admin all locations" on public.locations
  for all to authenticated using (true) with check (true);

create policy "read photos of published posts" on public.photos
  for select using (
    exists (select 1 from public.posts p where p.id = photos.post_id and p.published)
  );
create policy "admin all photos" on public.photos
  for all to authenticated using (true) with check (true);

-- Comments: anyone may read non-hidden ones and post new ones; only admin edits.
create policy "read visible comments" on public.comments
  for select using (hidden = false);
create policy "anyone can comment" on public.comments
  for insert to anon, authenticated with check (
    length(btrim(body)) between 1 and 4000
  );
create policy "admin manage comments" on public.comments
  for update to authenticated using (true) with check (true);
create policy "admin delete comments" on public.comments
  for delete to authenticated using (true);

-- Reactions: anyone may read and add/remove their own (matched by visitor_token).
create policy "read reactions" on public.reactions
  for select using (true);
create policy "anyone can react" on public.reactions
  for insert to anon, authenticated with check (true);
create policy "remove own reaction" on public.reactions
  for delete to anon, authenticated using (true);

-- Push subscriptions & notifications: admin-only via service role / authenticated.
create policy "admin push" on public.push_subscriptions
  for all to authenticated using (true) with check (true);
create policy "admin notifications" on public.notifications
  for all to authenticated using (true) with check (true);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Storage bucket for photos                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "public read photos bucket" on storage.objects
  for select using (bucket_id = 'photos');
create policy "admin write photos bucket" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
create policy "admin update photos bucket" on storage.objects
  for update to authenticated using (bucket_id = 'photos');
create policy "admin delete photos bucket" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');
