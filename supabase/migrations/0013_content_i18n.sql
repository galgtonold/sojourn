-- Per-row content translations.
--
-- The authored text stays in the existing base columns (title, body, …) — that
-- is the canonical *source*. `i18n` carries machine translations keyed by
-- locale and holds ONLY the non-source locale(s), so the read-time rule is
-- simply: localize(row, locale) = i18n[locale] ?? base.
--
--   posts.i18n        = { "en": { "title", "excerpt", "body" } }
--   trips.i18n        = { "en": { "title", "summary" } }
--   photos.i18n       = { "en": { "caption", "alt" } }
--   interactions.i18n = { "en": { "question", "options":[…], "explanation" } }
--
-- translation_status: 'none' | 'pending' | 'ready' | 'error'
-- i18n_source_hash: hash of the source fields, so an unchanged re-save skips
-- a needless re-translation.
--
-- No new RLS: these columns inherit each table's existing policies (published
-- posts/photos/trips are public-read so translations ride along; interactions
-- stay service-role-only and are localized server-side).

alter table public.posts
  add column if not exists source_locale text,
  add column if not exists i18n jsonb not null default '{}'::jsonb,
  add column if not exists translation_status text not null default 'none',
  add column if not exists i18n_source_hash text;

alter table public.trips
  add column if not exists source_locale text,
  add column if not exists i18n jsonb not null default '{}'::jsonb,
  add column if not exists translation_status text not null default 'none',
  add column if not exists i18n_source_hash text;

alter table public.photos
  add column if not exists i18n jsonb not null default '{}'::jsonb;

alter table public.interactions
  add column if not exists i18n jsonb not null default '{}'::jsonb;
