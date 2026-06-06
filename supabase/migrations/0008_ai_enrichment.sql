-- AI enrichment: per-photo descriptions + reverse-geocoded place names, and a
-- scratch notes field on posts that feeds the AI drafter.
alter table public.photos add column if not exists ai_description text;
alter table public.photos add column if not exists place_name text;
alter table public.photos add column if not exists enriched_at timestamptz;

alter table public.posts add column if not exists ai_notes text;
