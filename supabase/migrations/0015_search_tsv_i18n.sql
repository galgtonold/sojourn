-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Sojourn — index i18n translations into full-text search                   ║
-- ║                                                                            ║
-- ║  search_tsv only covered the source-language title/excerpt/body, so a      ║
-- ║  query in one language couldn't full-text-match content authored in the    ║
-- ║  other (e.g. German "Gletscher" missed an English-source post that has a    ║
-- ║  German translation). Fold the de + en i18n fields into the vectors.        ║
-- ║  Generated columns can't be ALTERed, so drop + re-add.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

set search_path = public, extensions;

drop index if exists posts_search_idx;
alter table public.posts drop column if exists search_tsv;
alter table public.posts add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'title', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'title', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'excerpt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'excerpt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'body', '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'body', '')), 'C')
  ) stored;
create index posts_search_idx on public.posts using gin(search_tsv);

drop index if exists photos_search_idx;
alter table public.photos drop column if exists search_tsv;
alter table public.photos add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(caption, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'caption', '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(place_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(alt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'de'->>'alt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(i18n->'en'->>'alt', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ai_description, '')), 'C')
  ) stored;
create index photos_search_idx on public.photos using gin(search_tsv);
