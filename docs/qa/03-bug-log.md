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
