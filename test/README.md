# Tests

Run with [Vitest](https://vitest.dev):

```bash
npm test          # run everything once (fast, deterministic, no network)
npm run test:watch
npm run test:coverage   # text + HTML report under coverage/
```

Over a thousand tests run in a few seconds, with no network. Coverage is scoped
to logic worth unit-testing — not React components, browser-only clients, or
thin Supabase wrappers (see the `exclude` list in `vitest.config.ts`) — and sits
around 75% of statements in `src/lib`.

That number used to be quoted here as ~95%, against ~90 tests. Both had drifted
a long way, in the flattering direction, which is the failure mode a coverage
claim in a README always has: nothing recomputes it. Run `npm run test:coverage`
rather than believing this paragraph, and treat the shape as the useful part —
the gap is concentrated in modules that talk to Supabase and in the auth guards,
not spread evenly.

## Layout

- `unit/` — pure + lightly-faked logic. The poll/quiz parser + validator
  (`interactions-parse`), body rendering split (`rich`), prompt/dossier builders,
  cost estimation, loose JSON parsing, `utils` (optimizedSrc/readingTime/…),
  `slug` (transliteration + a sweep of every Latin Unicode block), `gpx`
  maths, `i18n` translation, and the data layer's demo fallback + hydration
  (`content`). The I/O chokepoints — `deepseekChat`, `reverseGeocode`,
  `recordUsage`, `getViewer` — are tested with `fetch`/Supabase faked.
- `e2e/pipeline.test.ts` — the **AI drafting pipeline end-to-end** with both
  external seams faked. It drives the real `outline → section → captions →
  save-draft` route handlers and asserts the wiring: the section route's
  self-repair loop fixes a deliberately broken section, an AI-authored `:::poll`
  block is materialised into the `interactions` table and rewritten to
  `[ask:<id>]`, and the saved body validates with no dangling references.
- `e2e/live.test.ts` — the same flow against the **real DeepSeek API**. Opt-in
  and skipped by default.
- `browser/` — **Playwright**, against a real all-in-one stack running this
  commit's image. `*.spec.ts`, not `*.test.ts`, so Vitest's include glob leaves
  them alone. See "Browser end-to-end" below — the journey is the least
  interesting part of it.
- `helpers/` — `fake-supabase` (in-memory query builder), `fake-deepseek`
  (scripted, repair-loop aware), `seed` (one post + enriched photos).

## The two seams

The pipeline depends on exactly two external things, both mocked per test file:

- **DeepSeek** — one chokepoint, `deepseekChat` in `src/lib/ai/deepseek.ts`.
  Replaced via `vi.mock` while keeping `parseJsonLoose` real. Files that reach
  the provider config also mock `@/lib/ai-config`: `getAiConfig` is a Next
  `unstable_cache` and needs a request-scoped cache no unit test can supply.
- **Supabase** — `getServerSupabase` in `src/lib/supabase/server.ts`, replaced
  with the in-memory fake. The materializer, dossier builder and validation all
  run for real against it.

## Row-level security (real Postgres)

The in-memory fake models the SHAPE of PostgREST responses — not row-level
security, not column grants, not EXECUTE privileges. So until this suite
existed, the policies in 48 migrations were checked by reading them, and the
history shows the cost: 0036 broke `select=*` and was found during a backup;
0043 broke `comments(count)` and every post page rendered as not-found until
someone browsed to one; 0043 itself documents four security defects that had
been live for months; 0048 fixed a fifth of the same kind.

These run as the `anon` role against a real database and assert both
directions — what a visitor must not reach, and what the public site depends on
reaching. Over-tightening has taken the site down twice; a leak is not the only
way to get this wrong.

**This runs in CI now** (the `rls` job), on every push and PR. It spent its
first stretch in the repo opt-in behind `RLS_DATABASE_URL` with nothing setting
that variable — so it skipped on every run and read as coverage. The job asserts
a non-zero passing count for exactly that reason: a suite that skips quietly is
the failure mode it was written to prevent.

To run it by hand, the all-in-one stack brings up a database:

```bash
docker compose -f docker-compose.all-in-one.yml --env-file .env.selfhost up -d db storage
DATABASE_URL=postgres://postgres:<pw>@127.0.0.1:5432/postgres node scripts/migrate.mjs
RLS_DATABASE_URL=postgres://postgres:<pw>@127.0.0.1:5432/postgres npm run test:rls
```

Point it at a **throwaway** database. It writes fixtures and removes them again,
but it is not something to aim at anything you care about. With
`RLS_DATABASE_URL` unset the whole file skips, so `npm test` is unaffected.

## Browser end-to-end (real stack)

```bash
docker build -t ghcr.io/galgtonold/sojourn:e2e .
npm run e2e:up -- --tag e2e     # ports 3801/8801, project `sojourn-e2e`
E2E_BASE_URL=http://localhost:3801 npm run test:browser
npm run e2e:down                # -v, so the next run is a fresh install again
```

Runs in CI on every push and PR (`e2e` job), against an image built from that
commit — not the last published one, or a PR would be testing the last release.

**The journey is not the point.** Sign in, write a post, look at it — that script
passes straight through every failure this project has actually had. What earns
this suite its four minutes is in `browser/harness.ts`, attached to every spec
automatically:

- **Nothing may be silent.** Any console error, any uncaught exception, any
  failed same-origin request fails the test. Muting one takes
  `silence.allow(pattern, reason)` — with the reason, in the spec.
- **Round-trip budgets.** Kong's access log is the only place that sees what the
  app asks Supabase for; server-rendered queries and middleware auth checks
  never reach the browser, so Playwright's own network events cannot see them.
  The regression that motivated this — 45 auth calls per page load, which locked
  an admin out of their own site — was entirely server-side.
  - Counted as **deltas**. `docker logs` replays the whole container history, so
    a total taken afterwards is cumulative and a real fix reads as no change.
    That mistake has been made twice here and reported as "no effect" both times.
  - Every budget spec runs `assertIdleIsQuiet` first. If five seconds of doing
    nothing "costs" as many requests as a page load, the number is measuring
    something else and the budget below it is decoration.
- **The map holds data.** `expectMapAlive` asserts a MapLibre *marker* exists,
  not just a canvas. Everything the app adds to a map happens inside
  `map.on('load')`, so a marker is proof the handler ran — and when the worker
  dies (CLAUDE.md), load never fires, the basemap keeps painting raster tiles,
  and the map looks completely fine in a screenshot.

Slugs are asserted by URL (`/posts/a-am-ende-der-strasse`) rather than by
unit-testing `slugify` twice: the question here is whether what the editor
saved is what the public route resolves.

The map needs a fixture (`browser/seed-geo.mjs`): the journey cannot produce a
geotagged photograph, because locating one means uploading it with GPS EXIF, so
`/map` would correctly render its empty state and the assertion would have
nothing to assert. The fixture uploads a real object to the stack's own storage
rather than linking one elsewhere — Next's optimizer only accepts the hosts in
`remotePatterns`, and pointing at a public photo site would make CI depend on
that site being up. `/map` is prerendered and revalidates hourly, so the spec
then saves a post through the admin UI to trigger the route's
`revalidatePath("/map")`, which also means an invalidation regression fails here
rather than as a reader wondering where their photographs went.

Its first working run found three bugs, all of which the happy path walked
straight past: the admin dashboard querying trips through the anon client, an
optimizer URL that 404s on every self-hosted install, and `moveLayer` throwing
for a tracks layer that is never added when a journal has no GPX. See CLAUDE.md.

## Live smoke test (real DeepSeek)

Hits the real API (a few cents per run, non-deterministic — assertions stay
loose). Needs a real key:

```bash
DEEPSEEK_API_KEY=sk-... npm run test:ai:live
```

It uses the in-memory Supabase fake, so no database is required.
