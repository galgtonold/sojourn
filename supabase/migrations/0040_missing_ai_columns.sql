-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Two columns the app has always read but no migration ever created.     ║
-- ║                                                                          ║
-- ║  They exist on the author's production database — added by hand, long    ║
-- ║  ago, outside the migration history — so everything worked there and     ║
-- ║  nothing worked anywhere else. A database built only from this folder    ║
-- ║  (the path the README documents, and the one every self-hoster takes)    ║
-- ║  came out missing both:                                                  ║
-- ║                                                                          ║
-- ║    trips.ai_context   /admin/trips/[id] selects it. PostgREST answers    ║
-- ║                       "column does not exist", the page calls            ║
-- ║                       notFound() — so on a fresh install EVERY trip      ║
-- ║                       edit link led to a 404, with nothing to suggest    ║
-- ║                       the cause was schema drift.                        ║
-- ║                                                                          ║
-- ║    tracks.started_at  the AI dossier reads it to date an entry from its  ║
-- ║                       GPS track, so drafting failed the same way.        ║
-- ║                                                                          ║
-- ║  Both are `if not exists`, so this is a no-op on any database that       ║
-- ║  already has them, production included.                                  ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Per-trip guidance handed to the AI alongside the site-wide writing style:
-- who was on this journey, how names are spelled, what to never call it.
-- The sibling of posts.ai_notes (0008), and private for the same reason.
alter table public.trips add column if not exists ai_context text;

-- When the recording actually began. GPX carries it; the dossier uses it to
-- date an entry when the author hasn't set one yet.
alter table public.tracks add column if not exists started_at timestamptz;

-- Deliberately NOT granted to anon. 0036 column-scoped anon's SELECT on trips
-- precisely so ai_context could never be read through the public API, and it
-- fails closed for columns added later — this one included. `authenticated`
-- holds table-level SELECT (0020), so the editor sees it without a new grant.
--
-- tracks was never column-scoped, so started_at is anon-readable along with the
-- rest of the row. That is correct: a track is only exposed at all for a
-- published post, and when it was recorded is part of that published content.
