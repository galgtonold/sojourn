# Tests

Run with [Vitest](https://vitest.dev):

```bash
npm test          # run everything once (fast, deterministic, no network)
npm run test:watch
```

## Layout

- `unit/` — pure logic: the poll/quiz parser + validator (`interactions-parse`),
  body rendering split (`rich`), prompt builders, cost estimation, loose JSON
  parsing. No network, no DB.
- `e2e/pipeline.test.ts` — the **AI drafting pipeline end-to-end** with both
  external seams faked. It drives the real `outline → section → captions →
  save-draft` route handlers and asserts the wiring: the section route's
  self-repair loop fixes a deliberately broken section, an AI-authored `:::poll`
  block is materialised into the `interactions` table and rewritten to
  `[ask:<id>]`, and the saved body validates with no dangling references.
- `e2e/live.test.ts` — the same flow against the **real DeepSeek API**. Opt-in
  and skipped by default.
- `helpers/` — `fake-supabase` (in-memory query builder), `fake-deepseek`
  (scripted, repair-loop aware), `seed` (one post + enriched photos).

## The two seams

The pipeline depends on exactly two external things, both mocked per test file:

- **DeepSeek** — one chokepoint, `deepseekChat` in `src/lib/ai/deepseek.ts`.
  Replaced via `vi.mock` while keeping `parseJsonLoose`/`aiModels` real.
- **Supabase** — `getServerSupabase` in `src/lib/supabase/server.ts`, replaced
  with the in-memory fake. The materializer, dossier builder and validation all
  run for real against it.

## Live smoke test (real DeepSeek)

Hits the real API (a few cents per run, non-deterministic — assertions stay
loose). Needs a real key:

```bash
DEEPSEEK_API_KEY=sk-... npm run test:ai:live
```

It uses the in-memory Supabase fake, so no database is required.
