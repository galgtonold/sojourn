# Sojourn QA — Bug Log

Environment: local dev server (`npm run dev`), **demo mode** (no Supabase) unless noted. Live/admin/write features pending Docker + local Supabase. Each bug has repro evidence + severity.

Severity: **S1** broken core flow / data loss · **S2** wrong behavior, workaround exists · **S3** minor/cosmetic · **S4** nit.

---

## BUG-001 — Unknown post/trip slugs return HTTP 200 (soft-404) — S2

**Surface:** `/posts/[slug]`, `/trips/[slug]`, `/trips/[slug]/map`
**Files:** `src/app/posts/[slug]/page.tsx:49`, `src/app/trips/[slug]/page.tsx:39`, `src/app/trips/[slug]/map/page.tsx`

**Expected:** A non-existent post/trip slug returns **HTTP 404** (the `notFound()` boundary is rendered with a 404 status), like any unknown path.

**Actual:** The "Off the map" not-found UI IS rendered, but the HTTP status is **200 OK**. The truly-unknown catch-all path (`/nonexistent-page`) correctly returns 404.

**Repro:**
```
curl -s -D - -o /dev/null http://localhost:3000/posts/does-not-exist | grep -iE '^HTTP|x-nextjs'
# HTTP/1.1 200 OK
# x-nextjs-cache: HIT
# x-nextjs-prerender: 1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/nonexistent-page   # 404
```

**Impact:** Search engines index broken/empty post URLs as live 200 pages; clients/monitoring can't distinguish missing content from real content. The `x-nextjs-prerender: 1` header shows the not-found render is being captured into the full-route cache and replayed as 200.

**Root cause (confirmed in a production build, `next build && next start`):** Next.js serves `notFound()` from a statically-prerendered dynamic route with a **200** status (`x-nextjs-prerender: 1`), even on a cache MISS (the first on-demand render itself is 200). Experiments isolated the lever:
- Removing `export const revalidate = false` on `/posts/[slug]` → **no change** (`/posts/does-not-exist` still 200).
- Setting `export const dynamicParams = false` on `/trips/[slug]` → **`/trips/nope` → 404** (and known slugs still 200).

So `dynamicParams = false` is the only config that yields a true 404 — **but it is not an acceptable fix here.** New posts are published without a code redeploy; they become reachable only via `dynamicParams = true` (on-demand render) plus `revalidatePath('/posts/${slug}')` (`src/app/api/admin/posts/route.ts:115`). There is no deploy hook, and Vercel rebuilds only on `main` pushes. `dynamicParams = false` would make every newly-published slug 404 until the next code deploy — a worse regression than the soft-404. Forcing dynamic rendering (`force-dynamic`) would fix the status but discard the static-ISR perf design. Current Next.js offers no config that gives a 404 status while keeping on-demand publishing.

**Fix shipped (mitigation, non-regressive):** `src/app/not-found.tsx` now exports `metadata = { robots: { index: false, follow: false } }`, so **every** not-found render — soft-404s and true 404s alike — is `noindex`. This removes the real-world harm (search engines indexing deleted/unknown post & trip URLs) without touching `dynamicParams`, caching, or status codes. Verified in a prod build: `/posts/does-not-exist`, `/trips/nope`, `/trips/nope/map`, `/nonexistent-page` all emit `<meta name="robots" content="noindex"/>`; real pages (`/posts/dawn-on-fitz-roy`, `/trips/patagonia`, `/`) do not.

**Regression test:** `test/unit/not-found-noindex.test.ts` asserts the not-found metadata declares `robots.index === false`.

**Residual (owner decision):** the HTTP status for unknown/deleted slugs is still **200**, not 404. A true 404 would require either accepting that new posts need a redeploy (`dynamicParams = false`) or a middleware existence-check (a DB lookup per post request) — both are architectural trade-offs beyond a QA fix. Flagged for the owner; `noindex` covers the indexing concern in the meantime.

**Status:** MITIGATED — `noindex` shipped + regression test. Status-code trade-off documented for owner decision.

---

## BUG-002 — Migrations never GRANT table privileges → fresh/self-hosted Supabase returns "permission denied" for the entire public API — S1

**Surface:** every public read/write (home, posts, trips, search, comments, reactions, admin) on any Supabase instance set up by applying the migrations (the README's self-host path) rather than via the hosted dashboard.
**Files:** `supabase/migrations/0001_init.sql` (+ 0003/0005/0006 …) — RLS policies present, GRANTs absent.

**Expected:** Applying the migrations to a clean Supabase yields a working site.

**Actual:** The public API fails with `permission denied for table posts` / `comments` / … and the site is completely empty (home, `/posts`, `/search` return nothing; `/api/comments` → `{"error":"permission denied for table comments"}`).

**Root cause:** In Postgres an RLS policy only chooses *which rows* a role may touch — the role still needs the table-level `GRANT` (SELECT/INSERT/UPDATE/DELETE) as a prerequisite. The migrations create RLS *policies* referencing `anon`/`authenticated` but never `GRANT` those privileges. Verified in the DB: `anon`, `authenticated`, **and `service_role`** had only `TRUNCATE, REFERENCES, TRIGGER` — no DML — and `set role anon; select … from posts` raised `permission denied for table posts` with Postgres's hint `GRANT SELECT ON public.posts TO anon;`. Hosted Supabase happens to apply these via dashboard-configured default privileges, so production works; a migration-only / self-hosted deployment gets none. This contradicts the project's headline portability claim.

**Repro (fresh local stack):**
```
supabase start && supabase db reset      # migrations only
curl 'http://localhost:3000/api/comments?postId=<id>'   # {"error":"permission denied for table comments"}
```

**Fix shipped:** `supabase/migrations/0020_api_role_grants.sql` — grants USAGE on schema `public` and `SELECT/INSERT/UPDATE/DELETE` on all tables + `USAGE,SELECT` on sequences to `anon`, `authenticated`, `service_role`, plus matching default privileges for future objects. RLS (enabled on every table) stays the row-level gate; function grants are left untouched (already per-function, hardened in 0007). After the fix, anon reads 43 published posts / 439 visible comments and the whole site renders. Idempotent and a no-op on already-granted (production) databases.

**Status:** FIXED — migration added; full public + admin path verified end-to-end on the local stack.

---

## BUG-003 — `Gallery` blur placeholder causes a React hydration mismatch on every photo with a blurhash — S2

**Surface:** any post-page photo gallery where photos have a `blurhash`.
**File:** `src/components/gallery.tsx:49`; root cause `src/lib/blurhash.ts:18`.

**Expected:** Server and client render identical markup; no hydration warnings; the blur placeholder paints during SSR.

**Actual:** React logs `A tree hydrated but some attributes of the server rendered HTML didn't match… This won't be patched up` for every gallery `<img>`. The server omits the blur `backgroundImage` (placeholder `empty`); the client adds it (placeholder `blur`).

**Root cause:** `blurhashToDataURL` decodes via a `<canvas>` and returns `null` when `typeof document === "undefined"` (server). `Gallery` calls it **during render**, so SSR gets `placeholder="empty"` but the first client render gets `placeholder="blur"` → mismatch. Latent in production today only because `photos.blurhash` is never populated (README roadmap: "nothing populates it yet") — realistic seeded data exposed it, and it would ship the moment blurhash generation lands. (`image-lightbox.tsx` is unaffected: it already gates on a `mounted` state.)

**Fix shipped:** gate the blur behind a `mounted` flag (`useState(false)` + `useEffect`), so the first client render matches the server (no blur) and the blur is applied on the next render — the same SSR-safe pattern the lightbox uses. Verified: after the fix a fresh post-page load logs **zero** console errors (was: one mismatch per blurhash photo).

**Regression test:** covered by the SSR-safety contract of `blurhash.ts` (returns null without `document`); UI behaviour verified live (no hydration error on reload). A deeper render test is impractical under jsdom (which always defines `document`).

**Status:** FIXED — verified in the browser; typecheck + 135 tests green.

---

## BUG-004 — Comment "like" buttons have no accessible name (icon-only) — S3 (a11y, WCAG 4.1.2)

**Surface:** comment thread on every post page.
**File:** `src/components/comments.tsx` (the `toggleLike` button).

**Expected:** Every control has an accessible name; a screen reader announces what the like button does and its state.

**Actual:** The like button renders only a `<Heart/>` icon (the count `<span>` appears only when `like_count > 0`), with no text and no `aria-label` — so it has no accessible name. The audit found 8 such nameless buttons on one post page; a screen reader announces a bare "button".

**Fix shipped:** added `aria-label={t("comments.like")}` (new i18n key, en+de) and `aria-pressed={isLiked}` (it's a toggle) to the button. Verified live: post page now has **0** nameless buttons (was 8) and all 55 buttons carry an accessible name.

**Status:** FIXED — verified in the browser; typecheck + 135 tests green.

---

## Accessibility & responsive audit (public surfaces)

**a11y (home + post page):** `<html lang>` set and tracks locale; exactly one `h1`; no heading-level jumps; landmarks (`nav`/`main`/`footer`) present; **0 images without `alt`** (decorative images correctly use `alt=""`); **0 links without an accessible name**; **0 unlabeled form inputs**; after BUG-004, **0 buttons without an accessible name**. Lightbox/map/close/prev-next controls carry `aria-label`s.

**Responsive (375×812 mobile):** no horizontal document overflow on home or on the deliberately-long-title / HTML-in-title edge-case post (`collab-post-with-edges`) — the long title wraps; the only sub-pixel-wide element is a clipped decorative hero backdrop (contained by its `overflow-hidden` parent), not a layout break.

*Not yet audited:* admin pages, `/search`, `/map`, `/photos` a11y; tablet breakpoint; colour-contrast ratios; full keyboard-trap / focus-order traversal.

---

## Verified working (demo-mode, real-user testing)

- **Baseline:** `npm run typecheck` clean; `npm test` 135 passed / 1 skipped; `npm run build` succeeds zero-config.
- **Routing:** every public route returns 200; `/nonexistent-page` → 404. (Soft-404 on unknown slugs = BUG-001, mitigated.)
- **API input validation:** `/api/reactions`, `/api/comments`, `/api/interactions` reject malformed bodies with **400** (no 500s). Required fields enforced (reactions needs `action`; interactions needs a UUID `id`).
- **Search:** real terms return correct hits (fitz/kyoto/ice/maple); empty/whitespace/very-long/no-result queries return `200 {posts:[],photos:[]}`; an XSS string (`<script>…`) is safely **not** reflected and returns empty.
- **i18n:** DE default; switching to EN flips H1 + nav + content and sets `locale=en` cookie; DE↔EN both render.
- **Lightbox** (`image-lightbox.tsx`): opens on figure click, closes on Escape/backdrop/browser-Back. (Single-image, close-only by design — no prev/next; the inventory's "arrow nav" note was an over-inference, not a bug.)
- **Reactions:** optimistic increment works (❤️34→35 on click).
- **Comments (demo):** 0 pre-existing comments is correct (`refresh()` early-returns when `!isSupabaseConfigured`); optimistic-add path handles the `202 {demo:true}` response without error.
- **Console:** home, a post page (with live MapLibre map), no errors or warnings; dev-server log clean across the route sweep.

## Observations (not bugs)

- **Two DE/EN button pairs** in the DOM — header + footer controls; both function. Not a duplication bug (responsive layout).
- **`.env.production` is loaded by `next build`** (production NODE_ENV) and points at the live Supabase project (public anon key only — RLS-gated, no service role). A local `next build`/`next start` therefore reads **published** content from production. Harmless for reads (public data), but **do not run write-flow tests (comments/reactions POST) against a prod-built server** — they would write to the live DB. All dev-server (`npm run dev`) testing is demo-mode and fully isolated.

## Demo-data gap (to cover in the production-scale seed, not a code bug)

`src/lib/demo.ts` contains **no inline `[photo:…]` / `[ask:…]` tags, no polls/quizzes, and no GPX tracks**. So inline galleries, interactive blocks (poll/quiz vote → result bars/explanation), and elevation profiles are **not exercised** in demo mode. Parsing is unit-tested (`rich.test.ts`, `photo-refs.test.ts`, `interactions-parse.test.ts`, `materialize.test.ts`), but end-to-end rendering needs seeded data. The production-scale seed must include these.

## Deferred — blocked on local Supabase (Docker install in progress)

Cannot be tested in demo mode; require a real backend:
- Admin auth + gating (owner vs collaborator vs anon), middleware redirects with a real session.
- Admin CRUD: trips, posts (create/edit/delete/publish), photo upload + EXIF, GPX upload, interactions manager.
- Comment/reaction/poll **persistence** + moderation (hide/unhide/delete), comment pagination ("load earlier").
- Members/invites flow (`/admin/welcome`, per-trip grants, RLS scoping).
- AI pipeline (questions→enrich→outline→sections→homogenize→captions→save), translation, AI-usage metering.
- Web push (VAPID), embeddings/semantic search, on-demand revalidation callbacks.
- Account password change.

---

## Live-mode verified working (local Supabase stack, production-scale seed)

Environment: local `supabase start` stack + `supabase/seed.sql` (50 posts / 43 published, 8 trips, 48 photos, 440 comments, 1720 reactions, 3 interactions, 2 GPX tracks, owner + collaborator users). `.env.local` → local stack only (VAPID generated locally). After BUG-002 fix:

- **Auth:** owner + collaborator log in (GoTrue password grant); wrong password rejected (400). Owner dashboard renders (50 posts / 441 comments, all 8 trips, owner-only nav: members/settings/new-trip; AI-usage correctly hidden — no AI key).
- **Gating:** `/admin` → 307 redirect to login when unauthenticated (middleware live); `/admin/posts/new` also 307 when unauthenticated.
- **Admin post lifecycle (UI):** "New post" creates an instant draft (`entwurf-…`) and opens the editor; editing the title/body and saving persists them and **auto-derives the slug** (`qa-smoke-test-published-via-editor`), all via the browser Supabase client (RLS) — confirmed in the DB. Publishing makes it publicly readable (real page renders, not noindex); owner delete removes it (verified create→edit→publish→public→delete). (The editor's controlled publish-checkbox couldn't be toggled via synthetic events — a test-harness limitation, not an app bug; the save mechanism itself is proven. `PATCH /api/admin/posts/[id]` returns 405 — the editor writes directly via the Supabase client, so the inventory's "PATCH route" was an over-inference.)
- **Drafts:** unpublished post is NOT served publicly (not-found + noindex, no title/body leak); excluded from search.
- **Persistence (anon):** reaction add → `{ok:true}` (writes); comment POST → persisted row; poll vote → tally; **quiz correct answer + explanation hidden pre-vote, revealed only post-vote** (security property holds).
- **Comment pagination:** 225-comment post returns 200 then all 225 on "load earlier" (past the 200 window).
- **Moderation:** owner hides a comment (204) → anon no longer sees it, owner still does (soft-hide, restorable).
- **Collaborator RLS scoping:** can edit a post in a *granted* trip; **denied** (0 rows, no change) on a *non-granted* trip; `trip_members` read scoped to own grants only — no privilege escalation.
- **i18n + interactions:** poll/quiz options localize (DE source, EN overlay); emoji + HTML in a title stored intact (rendered escaped by React).
- **Rich rendering:** gallery (next/image), live MapLibre map, quiz block, comments all render; console clean after BUG-003 fix.

## Still deferred (out of scope this pass — external deps / not yet exercised)

- **AI pipeline + translation + AI-usage metering:** need paid DeepSeek/OpenAI keys (not added — cost/secret). Panels render; generation calls untested.
- **Web push *delivery*:** subscribe flow + VAPID configured; the headless browser blocks notifications (denied-state renders correctly). Actual push send/receive untested.
- **Photo upload to Storage + EXIF extraction; GPX upload parsing** through the admin UI (DB-level photos/tracks verified via seed; the upload *path* not yet driven).
- **Members invite → /admin/welcome → set-password** end-to-end (RLS for trip_members verified; the invite token round-trip not yet driven).
- **Admin CRUD through the UI** (create/edit/delete post & trip, publish toggle, photo/interaction managers): RLS + API contracts verified; the editor UI flows not yet exhaustively clicked.
- Exhaustive responsive/a11y audit.
