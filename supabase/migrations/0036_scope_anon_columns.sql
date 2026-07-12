-- Security: the anon (public PostgREST) role could read PRIVATE author columns
-- on published content, because RLS filters ROWS not COLUMNS and anon held
-- table-level SELECT on posts/trips. So `GET /rest/v1/posts?published=eq.true&
-- select=ai_notes` returned every published post's private scratch notes; the
-- same exposed trips.ai_context.
--
-- Fix: column-scope anon's SELECT to every column EXCEPT the private AI fields
-- (posts.ai_notes, trips.ai_context). This is "all columns except the private
-- one" — NOT "only the public columns" — because the hybrid-search RPCs
-- (search_posts_hybrid / search_photos_hybrid) are SECURITY INVOKER and execute
-- as anon, so they need SELECT on the internal ranking columns (search_tsv,
-- embedding, place_index). Withholding only ai_notes/ai_context blocks the leak
-- without breaking search: no anon-executed query references those two columns
-- (POST_SELECT in src/lib/content.ts was moved off `*` to an explicit public
-- column list in the same change — `SELECT *` errors when a role lacks a
-- column).
--
-- authenticated keeps full table SELECT (RLS already scopes owners/editors).
-- Column grants are also fail-closed for FUTURE columns: a newly added column is
-- not anon-readable until it is explicitly granted here.

revoke select on public.posts from anon;
grant select (
  id, slug, title, excerpt, body, cover_image, trip_id, location, lat, lng,
  published, published_at, view_count, created_at, updated_at, cover_alt,
  embedding, embedded_at, source_locale, i18n, translation_status,
  i18n_source_hash, photos_manual_order, translation_error, place_index, search_tsv
) on public.posts to anon;

revoke select on public.trips from anon;
grant select (
  id, slug, title, summary, cover_image, start_date, end_date, created_at,
  updated_at, source_locale, i18n, translation_status, i18n_source_hash,
  translation_error
) on public.trips to anon;
