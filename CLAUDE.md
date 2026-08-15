# Sojourn — working notes for Claude

> **Scope: the maintainer's own checkout.** This file is instructions to an
> agent working directly on the deployment, which is why it says to push to
> `main`. It is not the contribution process. If you are contributing, read
> [CONTRIBUTING.md](CONTRIBUTING.md) instead — open an issue, then a PR.
>
> The rest of this file is still worth your time: the gotchas below are real
> ones, each paid for once already.

## Shipping changes (maintainer, working on the deployment)
Production deploys automatically when `main` is updated (Vercel ↔ GitHub).
So once a change is done and verified, **commit and push to `main`** — don't leave
work sitting locally. Contributors: open a PR instead; `verify` runs on it.

**Validate before pushing** (production builds straight from `main`, so never push red):
1. `npm ci` — only needed on a fresh checkout (`node_modules` is gitignored)
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

**Test end-to-end after pushing:** confirm the Vercel build succeeded and spot-check
the affected page(s) on the live site before calling the work done.

Stage files explicitly when committing — `memory/` is untracked but not ignored, so
avoid `git add -A`.

## Stack
Next.js 15 (App Router) · React 19 · Tailwind v4 · Supabase · MapLibre GL · Vercel.
User-facing copy lives in `src/lib/i18n.ts` (en + de) — never hard-code strings.

## Gotchas learned the hard way
- **maplibre must be imported from `@/lib/maplibre`, never from `maplibre-gl`.** v6 is
  ESM-only and no longer inlines its Web Worker; it derives the worker's location from
  `import.meta.url`, which under webpack is not an http(s) URL — so `defaultWorkerUrl()`
  returns `''` and `workerFactory` calls `new Worker('', {type:'module'})`. An empty
  specifier resolves to the **page**, the worker dies parsing HTML, and nothing says so:
  no exception, no console error, no failed request. Vector tiles are fetched *inside*
  the worker, so they simply never appear in the network log while raster tiles keep
  arriving and the map looks alive. The vector source never finishes, `style.loaded()`
  stays false, and **`map.on('load')` never fires** — taking every source, layer and
  marker this app adds with it. Symptom: a basemap with no data, or, above the relief
  layer's zoom-6 cap, a blank rectangle. `@/lib/maplibre` sets `setWorkerUrl` to a copy
  that `scripts/copy-maplibre-worker.mjs` puts in `public/` (worker **and** the shared
  chunk it imports relatively — one without the other 404s just as silently).
  Diagnose by watching the worker, not the map: wrap `window.Worker`, and look for an
  empty URL and an immediate close. `test/unit/maplibre-worker.test.ts` guards both halves.
- **Counting requests from a container log means DELTAS — `docker restart` does not
  clear it.** Kong's access log is the only place that sees what the app asks
  Supabase for, so it is how you measure round trips per page. Restarting the
  container to "start fresh" does nothing: `docker logs` replays the whole
  history of that container, so every total is cumulative. Measured that way, a
  fix that took one page load from 45 auth calls to 1 read as 136 → 137, i.e. no
  effect, and was reported as such — twice, once after rebuilding to add
  diagnostics. Take `n0=$(docker logs … | grep -c …)` before and `n1` after, and
  subtract. Run an IDLE control first: if 30 seconds of doing nothing shows the
  same "count" as one request, the number is not measuring what you think.
  Related: `docker compose up -d --force-recreate` on a service whose IMAGE
  changed gives a new container and a fresh log; one whose only change is inline
  `configs.content` does not get recreated at all (see docker-compose.all-in-one.yml).
- **A map that looks broken locally is usually a stale `next start`, not the code.**
  Those servers hold the *old* build in memory and keep serving it, and an ISR
  revalidation on a page like `/map` **writes that stale HTML back into `.next/server/app/`**
  — so a freshly built tree starts serving chunk hashes that no longer exist and the
  page 404s its own JavaScript. It reads exactly like a broken build. Kill by port owner
  (`taskkill /F /T`) and confirm the port refuses connections before rebuilding; stopping
  the `npx` wrapper leaves the node child alive and listening.
- **Rounded image cards: corner fringe needs `.paint-group`.** A bright cover under a
  dark scrim, both clipped by the card's rounded corner, leaves a 1px light arc at the
  corners: each layer antialiases its own ~half-coverage edge pixels against the same
  arc, so the bright cover bleeds through no matter what's painted on top. Bg tweaks,
  insets, hairline rings and removing hover-zoom all failed (see the "Revert … seam"
  commits). The fix: wrap the full-bleed stack (cover + placeholder + scrim) in
  `.paint-group` (globals.css, `opacity: .999`) *inside* the clipped element — opacity
  < 1 forces group rendering, so the stack flattens once and the clip rasterizes once.
  Hover-zoom transforms and the blur placeholder are fine with the group in place.
- **A reasoning model that will not stop reasoning cannot be fixed with a bigger
  cap — turn the thinking off.** `reasoning_content` is billed against
  `max_tokens` and arrives *before* the first byte of the answer, so a model that
  over-deliberates spends the whole budget thinking and returns `finish_reason:
  "length"` with **empty** `message.content`. A JSON caller then throws "Could
  not parse model JSON output". Measured on the proofreader against a real
  4,600-character German article: an 8000 cap produced 8000 reasoning tokens and
  no answer; 32000 produced 32000 and no answer, the thinking visibly circling
  back over sentences it had already cleared. Sending `thinking: {type:
  "disabled"}` returned the same article in ~6s — and caught 5/5 planted errors
  where the reasoning run caught 4/5. Use `ChatOpts.noThinking` for recognition
  tasks (proofreading, classification); leave thinking on for drafting.
  Diagnose from `ai_usage`: `reasoning_tokens ≈ completion_tokens` with an empty
  `response_preview` is this failure exactly.
- **There is no cap escalation any more, deliberately.** The JSON loop used to
  double `max_tokens` on every `length` finish up to 32000. It turned one
  failure into three, each slower than the last, all ending identically, with
  the author waiting through all of them. A retry is now only ever for a
  transient 5xx; anything that came back but did not parse goes straight to the
  single repair pass. Pick a cap that fits the work up front.
- **Raising a cap means raising the route's clock too.** They are one decision. An
  8000-token call on a reasoning model does not fit in Vercel's 60s, and a killed
  function records **nothing** — `recordUsage`/`recordAiFailure` run *after* the
  response returns — so `ai_usage` shows the preceding step succeeding and then
  silence, which reads like "the route was never called". The only trace is a 504
  in the Vercel runtime logs (`get_runtime_errors`), and the client's
  `humanError()` maps a 504's non-JSON body to the *generic* "try again" message,
  not the network one — so the UI actively misleads you. Any route running an
  8000-token call carries `maxDuration = 180`.
- **Once the session changes, leave with a document load.** Sign in, the demo
  one-click, the install claim and sign out all did `router.push(href)` with
  `router.refresh()` on the next line, and that pairing produced three failures
  of one shape: stuck on `/admin/login` reading "Anmelden…", stuck on
  `/admin/setup` reading "Wird angelegt…", twice in CI and once on a loaded
  laptop. Authentication had **succeeded** every time — token requests 200, no
  5xx, no 429 in the gateway log — but `busy` is only cleared on the error path,
  so a push that never lands is indistinguishable from a click that did nothing,
  permanently. `refresh()` refetches the current route while the push's fetch for
  the next one is in flight; they race. And a soft navigation is wrong here even
  when it wins: the router cache was filled under the old session, and `/admin`
  was probably prefetched while signed out and answered with a redirect to
  login — which is what the `refresh()` was reaching for. Use
  `navigateAfterAuth` (`@/lib/auth-navigate`); `test/unit/auth-navigate.test.ts`
  guards the four sites. Related: the `staleTimes` note in
  `test/unit/router-cache-staleness.test.ts` is the same cache, seen from the
  other side.
- **`images.unoptimized` does not stop code that builds `/_next/image` by hand.**
  The published Docker image cannot know where a stranger's Supabase lives, so
  `next.config.mjs` turns the optimizer off — and on such a build `/_next/image`
  answers **404 for every remote URL**. `optimizedSrc` composed that URL itself,
  so map thumbnails and `og:image` share cards silently lost their pictures on
  every self-hosted instance, with nothing but a console 404 to say so. The
  decision is only knowable at build time, so it is handed to the client as
  `NEXT_PUBLIC_IMAGES_UNOPTIMIZED` and `optimizedSrc` returns the original URL.
  `shareImage` builds on it and must not glue `siteUrl` onto an already-absolute
  result. Found by the browser suite's no-failed-requests invariant, not by
  looking at the page — the map still drew.
- **The anon client cannot see a trip with nothing published in it.** RLS's
  `read published trips` policy is exactly right for the public site and wrong
  for the admin, where a trip created a moment ago necessarily has no posts. The
  dashboard used the public `getTrips()`, so a trip you had just saved did not
  appear in your own admin, the "create your first trip" checklist stayed
  unticked, and `viewer.isOwner ? allTrips : …` filtered a list RLS had already
  truncated. Nothing failed: PostgREST returned `200` and `[]`. Admin pages use
  `getTripsForEditor()` (request-scoped client, carries the session, so
  `editors read every trip` applies); public pages keep `getTrips()`.
- **NFKD is not transliteration, and the letters it misses are the ones a travel
  journal needs.** `normalize("NFKD")` only decomposes characters Unicode defines
  a decomposition for. Stroked and ligature letters have none — Danish treats `ø`
  as its own letter, not an `o` wearing a mark — so `ø æ ß þ ð đ ł` fell through
  to the `[^a-z0-9]` bucket and became hyphens: `Ærøskøbing` → `r-sk-bing`,
  `Straße` → `stra-e`, `Tromsø` → `troms`. It looks like it works because the
  accented cases it *does* handle (`ü`, `ó`, `ō`) are the ones you test with.
  `slugify` lives in `@/lib/slug` and uses `transliteration`; it is **not** in
  `utils.ts`, because that is imported by client components for `cn()` and the
  table is ~190KB. The admin editors send the slug the author typed (or `""`)
  and let the route derive the rest — check `grep -rl transliteration .next/static/`
  comes back empty after touching this. Two traps inside the fix: lowercasing
  before transliterating "fixes" `ẞ` and breaks 58 phonetic letters the table
  keys on their uppercase form (rescue per character instead, only where the
  first pass produced nothing); and `slugify` legitimately returns `""`, which
  satisfies `not null` — so every caller needs a fallback or the first such
  record takes a dead URL and the second 500s on the unique index.
  `test/unit/slug.test.ts` sweeps every Latin Unicode block so a regression
  fails there instead of in somebody's URL.
- **Tailwind v4 `space-y-*` beats per-child `mt-*`.** Its generated selector has higher
  specificity, so a heading's own `mt-10` is silently overridden, leaving headings flush
  with body text. Own block rhythm on the container with sibling selectors
  (`[&>*+h2]:mt-10`, …), not via `mt-*` on the element.
- **An npm failure that "must be a version skew" is almost certainly `.npmrc`.** The
  repo's `.npmrc` sets `legacy-peer-deps=true`, so peer resolution differs completely
  between a directory that has it and one that does not. The Dockerfile once copied
  only `package.json` and `package-lock.json`, which made the image the sole
  environment resolving peers strictly, and `npm ci` there demanded 48 packages
  "missing from lock file" against a lockfile everything else accepted — killing
  v0.1.3's release build. It reads exactly like npm versions disagreeing, and
  reproducing it in a scratch directory holding just the two files "confirms" that
  false story, because the scratch directory is missing the same file. **Any scratch
  reproduction of a dependency problem must include `.npmrc`.**
- **Never `npm ci` the workspace inside a container.** `npm ci` deletes and rebuilds
  `node_modules`, so `docker run -v "$PWD":/w … npm ci` leaves musl binaries in a glibc
  checkout. CI's lockfile guard did this and the next native module to load blamed the
  lockfile — vitest 4's rolldown reported "Cannot find native binding" for a lock that
  was correct. Copy `package.json`, `package-lock.json` and `.npmrc` somewhere else and
  run it there; `node_modules` is not one of the inputs to the question being asked.
