-- Searching for "Vrango" could not find the story called "Vrångö".
--
-- The full-text index is built with `to_tsvector('simple', ...)`, which keeps
-- diacritics: 'Vrångö' becomes the token `vrångö`, and nothing a German
-- keyboard produces without effort will ever match it. Measured against
-- production before this: "Vrångö" → 1 post, "Vrango" → 0.
--
-- That is not an exotic case for this journal. Göteborg, Härjedalen, Vrångö,
-- Fränkische — most of the place names a reader would search for carry a
-- diacritic, and the reader typing them is usually on a keyboard that does not
-- have it, or is half-remembering the spelling. Semantic search papers over
-- some of it, but the exact-title match is precisely the case where a reader
-- knows what they want.
--
-- Both sides have to agree, so this migration handles the STORED side and
-- @/lib/search-normalize handles the query side. Storing unaccented tokens
-- loses nothing: `simple` already lowercases, and nothing displays from the
-- tsvector.

create extension if not exists unaccent with schema extensions;

/**
 * `unaccent(text)` is STABLE, not IMMUTABLE, because it depends on a dictionary
 * that could in principle be reloaded — and a generated column requires
 * IMMUTABLE. The two-argument form takes the dictionary explicitly, which is
 * what makes pinning it safe; this is the documented way round it.
 */
create or replace function public.immutable_unaccent(txt text)
returns text
language sql
immutable
strict
parallel safe
-- Pinned for the same reason every other definer/immutable function here is.
set search_path = extensions, public, pg_temp
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, txt)
$$;

-- ── posts ────────────────────────────────────────────────────────────────────
--
-- A generated column cannot be altered in place, so it is dropped and re-added.
-- That drops the GIN index with it, hence the recreate. Both tables are small
-- (tens of posts, hundreds of photos), so the rewrite is quick — but this is
-- the reason the migration is worth reading before it runs somewhere large.

alter table public.posts drop column if exists search_tsv;
alter table public.posts
  add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(excerpt, ''))), 'B') ||
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(location, ''))), 'B') ||
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(body, ''))), 'C')
  ) stored;
create index if not exists posts_search_idx on public.posts using gin(search_tsv);

-- ── photos ───────────────────────────────────────────────────────────────────

alter table public.photos drop column if exists search_tsv;
alter table public.photos
  add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(caption, ''))), 'A') ||
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(place_name, ''))), 'B') ||
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(alt, ''))), 'B') ||
    setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(ai_description, ''))), 'C')
  ) stored;
create index if not exists photos_search_idx on public.photos using gin(search_tsv);

-- The column is regenerated, so anon's grant on it has to be restored: 0036 and
-- 0043 column-scoped these tables, and a dropped column takes its grant with
-- it. Getting this wrong is how `select=*` broke once already.
grant select (search_tsv) on public.posts to anon, authenticated;
grant select (search_tsv) on public.photos to anon, authenticated;
