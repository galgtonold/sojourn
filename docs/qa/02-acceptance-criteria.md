# Sojourn QA — Acceptance Criteria & Risk-Based Edge Cases

Per feature: **AC** = must-hold acceptance criteria; **Edge** = finite, risk-prioritised edge cases to probe. ✅ = verified this pass (demo); ⛔ = deferred (needs local Supabase). See [03-bug-log.md](03-bug-log.md).

## Routing & not-found
- **AC:** Every public route renders 200. Unknown content shows the "Off the map" UI. Not-found renders are `noindex`. ✅
- **Edge:** unknown `/posts/[slug]`, `/trips/[slug]`, `/trips/[slug]/map` (✅ → soft-404 BUG-001, mitigated); fully unknown path → 404 ✅; deleted/unpublished post URL ⛔ (live); trailing slash / casing; very long slug.

## Home `/`
- **AC:** Hero + cover render; up to 9 recent posts; map teaser; localised chrome. ✅
- **Edge:** zero posts (empty state) ⛔; 1 post; missing cover image; very long title wrap; reduced-motion users.

## Posts index `/posts`
- **AC:** Lists published posts, client-paginated, newest first. ✅ (loads)
- **Edge:** 0 / 1 / >page-size posts (pagination boundary) ⛔; draft excluded from public list ⛔.

## Post detail `/posts/[slug]`
- **AC:** Renders title/cover/body; inline `[photo:]` galleries + `[ask:]` blocks; reactions; comments; prev/next within trip; localised. ✅ (core) / ⛔ (inline blocks need seed)
- **Edge:** post with no photos / no trip / no body; broken inline ref; markdown injection/XSS in body; RTL/emoji/very long body; first vs last in trip nav.

## Trips index & detail `/trips`, `/trips/[slug]`
- **AC:** Trip cards; detail shows stats (distance/photos/stops), post grid, explore-map link only when map data exists; empty state when no posts. ✅
- **Edge:** trip with 0 posts (empty state) ✅(code path) ; no dates; no tracks (no map link); huge distances formatting.

## Maps `/map`, `/trips/[slug]/map`, `/photos`
- **AC:** MapLibre renders without console errors; markers/tracks/popups; journey scrubber pans; photo-explorer filters cards by viewport. ✅ (renders, console clean) 
- **Edge:** 0 geotagged photos; single point (no bounds); antimeridian/extreme coords; offline tiles; rapid scrub; many markers (clustering absent — roadmap).

## Search `/search`, `/api/search`
- **AC:** Query returns Stories+Photos; graceful empty state; no 500s; input never reflected unescaped. ✅
- **Edge:** empty/whitespace/very-long/no-result/XSS query ✅; non-Latin/diacritics; semantic vs full-text fallback ⛔ (embeddings).

## Reactions `reactions.tsx`, `/api/reactions`
- **AC:** 4 kinds toggle with optimistic count; one per kind per visitor token; malformed → 400. ✅ (optimistic, validation) / ⛔ (persistence, dedupe)
- **Edge:** double-click/spam toggle; missing token; demo `202` keeps baked counts; concurrent readers.

## Comments `comments.tsx`, `/api/comments(/like)`
- **AC:** Thread + one-level replies; optimistic post; like toggle; "load earlier" beyond 200; name persisted; malformed → 400. ✅ (validation, demo optimistic) / ⛔ (persistence, pagination, moderation visibility)
- **Edge:** empty body (blocked) ✅; 4000-char max; reply to deleted/hidden parent (orphan promotion); HTML in body; anonymous default name.

## Interactive blocks `interactive-block.tsx`, `/api/interactions`
- **AC:** Poll/quiz vote → result bars + total; quiz correct-answer/explanation only after voting and never sent pre-vote; one vote per token; UUID required. ✅ (validation, GET hides answer) / ⛔ (vote persistence, tally, render)
- **Edge:** vote twice (ignored); invalid choice index; demo `503` no-op; quiz with no explanation; many options.

## i18n (`i18n.tsx`, `i18n.ts`)
- **AC:** DE default; switch persists via `locale` cookie; UI chrome + translatable metadata switch; body shown in source language; missing key falls back EN→key. ✅
- **Edge:** unknown/malformed cookie; metadata missing `i18n[locale]` (fallback to source); date/number locale formatting.

## PWA / service worker (`service-worker.tsx`, `public/sw.js`)
- **AC:** SW registers; visited pages cached; install prompt; offline read works; reads-only offline. ⛔ (full offline) / partial ✅ (registers)
- **Edge:** SW update on deploy; offline write attempts fail gracefully; unsupported browser.

## Admin auth & gating (`middleware.ts`) ⛔
- **AC:** Unauthed `/admin/*` (except login/welcome) → redirect to login; owner sees all; collaborator scoped to granted trips; owner-only pages (members/settings/ai-usage/trips-new) blocked for collaborators.
- **Edge:** expired session; direct URL to another collaborator's post/trip; invite token reuse/expiry; logout.

## Admin CRUD — trips/posts/photos/tracks/interactions ⛔
- **AC:** Create/edit/delete persist + revalidate the right paths; slug autogen + collision (`entwurf-{uuid}`); publish toggles visibility; photo upload extracts EXIF lat/lng; GPX parses distance/elevation; inline-ref validation flags broken `[photo:]`/`[ask:]`.
- **Edge:** duplicate slug; unpublish (→ should 404/noindex, see BUG-001); huge upload / non-image / no-EXIF photo; malformed GPX; delete trip with posts; concurrent edits.

## Members / invites ⛔
- **AC:** Owner invites by email; per-trip grant/revoke; invite link → `/admin/welcome` sets password → collaborator; RLS enforces scope.
- **Edge:** invite existing user; revoke mid-session; expired/used token; remove collaborator owning drafts.

## AI pipeline + usage ⛔
- **AC:** questions→enrich→outline→sections→homogenize→captions→save completes; async job polling; partial-failure recovery; cost/cache metered; correct answers/captions saved; writing-style prompt applied.
- **Edge:** provider error/timeout; hallucinated photo refs flagged; token budget; cancel mid-run; demo (AI disabled).

## Web push ⛔
- **AC:** Enable registers subscription (VAPID); disable removes; states not-subscribed/subscribed/denied/unsupported; admin notified on new comment.
- **Edge:** permission denied; unsupported browser; duplicate subscribe; key mismatch.

## Account ⛔
- **AC:** Password change requires current pw + match; success/error states; unavailable in demo.
- **Edge:** wrong current pw; weak/short pw; mismatch.
