-- Sojourn — store nearby-landmark candidates per photo and make them searchable.
-- The vision step computes several nearby places per photo; persist them so they
-- are reused and folded into full-text (and, in code, the embedding).
set search_path = public, extensions;

alter table public.photos add column if not exists nearby_places text[];

-- array_to_string / array_out are STABLE (not IMMUTABLE), so they can't be used
-- directly in a generated column. Wrap the join in an IMMUTABLE helper — sound
-- for text[], whose element output is deterministic — so to_tsvector can index
-- the candidates word-by-word (each element tokenizes on whitespace).
create or replace function public.places_text(arr text[])
returns text
language sql
immutable
as $$
  select coalesce(array_to_string(arr, ' '), '');
$$;

-- Generated columns can't be ALTERed, so drop + re-add (matches migration 0015).
-- Adds the candidates at weight B alongside place_name/alt.
drop index if exists photos_search_idx;
alter table public.photos drop column if exists search_tsv;
alter table public.photos add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(caption, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(place_name, '')), 'B') ||
    setweight(to_tsvector('simple', public.places_text(nearby_places)), 'B') ||
    setweight(to_tsvector('simple', coalesce(alt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'alt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'alt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ai_description, '')), 'C')
  ) stored;
create index photos_search_idx on public.photos using gin(search_tsv);
