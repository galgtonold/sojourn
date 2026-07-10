-- Sojourn — store nearby-landmark candidates per photo and make them searchable.
-- The vision step computes several nearby places per photo; persist them so they
-- are reused and folded into full-text (and, in code, the embedding).
set search_path = public, extensions;

alter table public.photos add column if not exists nearby_places text[];

-- Generated columns can't be ALTERed, so drop + re-add (matches migration 0015).
-- Adds the candidates at weight B alongside place_name/alt. array_to_string is
-- IMMUTABLE, so it is valid inside a generated column.
drop index if exists photos_search_idx;
alter table public.photos drop column if exists search_tsv;
alter table public.photos add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(caption, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(place_name, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(nearby_places, '{}'::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'alt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'alt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ai_description, '')), 'C')
  ) stored;
create index photos_search_idx on public.photos using gin(search_tsv);
