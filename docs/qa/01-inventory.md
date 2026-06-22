# Sojourn QA — Feature & Surface Inventory

> Baseline for a full real-user QA pass. Generated 2026-06-22. Read-only mapping; no fixes applied here.

## 1. Routes (public)

| Path | File | Data | Key UI |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Posts (limit 9) + total | Hero cover, post grid, map teaser. ISR. |
| `/posts` | `src/app/posts/page.tsx` | Published posts (limit 1000) | Archive grid, client pagination (`posts-archive.tsx`). |
| `/posts/[slug]` | `src/app/posts/[slug]/page.tsx` | Post + trip + photos + tracks + interactions + comments (client) + prev/next | `post-view.tsx` (article, lightbox, elevation, reactions, comments, interactive blocks). |
| `/trips` | `src/app/trips/page.tsx` | All trips | Trip cards. |
| `/trips/[slug]` | `src/app/trips/[slug]/page.tsx` | Trip + posts + stats | Hero, stat badges, post cards, explore-map link. |
| `/trips/[slug]/map` | `src/app/trips/[slug]/map/page.tsx` | Trip posts + tracks geojson | `journey-explorer.tsx` scrubber + elevation. |
| `/map` | `src/app/map/page.tsx` | Map-optimized posts + tracks | Global map markers + track overlays. |
| `/photos` | `src/app/photos/page.tsx` | Geotagged photos + post snippet | `photo-explorer.tsx` map+grid viewport filter. |
| `/search` | `src/app/search/page.tsx` | Shell only | `search-box.tsx` + `search-results.tsx` (client). |
| 404 | `src/app/not-found.tsx` | — | "Off the map". |

## 2. Routes (admin, gated by `src/middleware.ts`)

| Path | File | Gate | Notes |
|---|---|---|---|
| `/admin/login` | `admin/login/page.tsx` | pre-auth | email/pw; demo notice if no Supabase. |
| `/admin/welcome` | `admin/welcome/page.tsx` | pre-auth (invite token) | set password for invited collaborator. |
| `/admin` | `admin/page.tsx` | authed | dashboard: stats, trips, recent comments. Owner-only cards gated. |
| `/admin/account` | `admin/account/page.tsx` | authed (live only) | change password. |
| `/admin/posts` | `admin/posts/page.tsx` | authed | list, search, filter all/published/draft, delete. |
| `/admin/posts/new` | `admin/posts/new/page.tsx` | authed | editor + photo/track/AI panels. |
| `/admin/posts/[id]` | `admin/posts/[id]/page.tsx` | authed + perm | edit; translation badge. |
| `/admin/posts/[id]/preview` | `.../preview/page.tsx` | authed | draft preview. |
| `/admin/trips/new` | `admin/trips/new/page.tsx` | owner | create trip. |
| `/admin/trips/[id]` | `admin/trips/[id]/page.tsx` | owner/collab | edit/delete trip. |
| `/admin/comments` | `admin/comments/page.tsx` | authed | moderation (hide/unhide/delete), threaded. |
| `/admin/members` | `admin/members/page.tsx` | owner | invite + per-trip grants. |
| `/admin/settings` | `admin/settings/page.tsx` | owner | writing-style prompt. |
| `/admin/ai-usage` | `admin/ai-usage/page.tsx` | owner | cost/cache metrics, recent 50 calls. |

## 3. API routes

**Public:** `GET /api/search`; `GET|POST /api/reactions`; `GET|POST /api/comments`; `POST /api/comments/like`; `GET|POST /api/interactions`; `POST|DELETE /api/push`; `POST /api/invite/accept`; `POST /api/revalidate`.

**Admin (auth/service-role):** `POST /api/admin/posts`; `PATCH|DELETE /api/admin/posts/[id]`; `POST /api/admin/posts/[id]/translate`; `POST /api/admin/trips`; `PATCH|DELETE /api/admin/trips/[id]`; `POST /api/admin/members`; `PATCH|DELETE /api/admin/members/[id]`; `POST /api/admin/settings`; `GET /api/admin/ai/job/[id]`; `POST /api/admin/ai/{questions,enrich-photo,enrich-post,outline,section,homogenize,captions,embeddings,save-draft}`; `POST /api/admin/revalidate`.

## 4. Roles
- **Anonymous visitor** — read all public content; comment/react/vote with localStorage visitor token; no admin.
- **Owner** — full CRUD, moderation, members, settings, AI, usage.
- **Collaborator** — edit own granted trips' posts/photos, moderate own posts' comments; no members/settings/AI/usage.
- **Invited (pre-auth)** — invite link → `/admin/welcome` → set password → collaborator.

Gating: middleware refreshes session, redirects unauthed `/admin/*` (except login/welcome). Owner-only pages: members, settings, ai-usage, trips/new. Per-trip access via `trip_members`.

## 5. Interactive surfaces (component → workflow)
- Reactions `reactions.tsx` — 4 emoji toggle → `POST /api/reactions` (visitor token), optimistic + refetch.
- Comments `comments.tsx` — post/reply, like (`/api/comments/like`), "load earlier" pagination, name in localStorage.
- Interactive block `interactive-block.tsx` — poll/quiz vote → `/api/interactions`, result bars + explanation (quiz).
- Lightbox `image-lightbox.tsx` — modal, prev/next, keyboard, tap-close.
- Maps `trip-map.tsx` / `story-map.tsx` / `journey-explorer.tsx` / `photo-explorer.tsx` — markers, popups, scrubber, viewport filter.
- Elevation `elevation-chart.tsx` — track altitude vs distance.
- Search `search-box.tsx` + `search-results.tsx` — query → `/api/search`, Stories/Photos tabs.
- Language switch `site-footer.tsx` + `i18n.tsx` — locale cookie, DE/EN.
- Push `push-toggle.tsx` / `subscribe-prompt.tsx` — enable/disable, permission UX.
- PWA `service-worker.tsx` — register sw, install prompt.
- Admin editor `post-edit-workspace.tsx` → `post-editor.tsx`, `photo-manager.tsx`, `track-manager.tsx`, `interaction-manager.tsx`, `ai-draft-panel.tsx`, `location-dialog.tsx`.
- Trip editor `trip-editor.tsx`; members `members-manager.tsx`; moderation `comment-moderation.tsx`; style `writing-style-form.tsx`.

## 6. Key states to test
loading / empty / error / success / optimistic / offline(PWA) / demo-vs-live (`isSupabaseConfigured`) / authed-vs-anon / owner-vs-collaborator / DE-vs-EN. Push: not-subscribed/subscribed/denied/unsupported. AI draft: idle/interview/generating/partial-error/saved.

## 7. Data dependencies (what breaks without config)
- Public read + reactions + comments + polls + full-text search: **anon key** only.
- Semantic half of search: **embeddings API** (degrades to full-text without).
- Photo captions / AI draft / translation: **service role + DeepSeek/Vision/embeddings**.
- Push: **VAPID** keys.
- Photo upload: **Supabase Storage** + service role.

## 8. Demo mode (`src/lib/demo.ts`, when `!isSupabaseConfigured`)
Functional: read content, substring search, poll/quiz optimistic, DE/EN, PWA read. Non-functional/stubbed: admin auth+CRUD, comment/reaction persistence (202 no-op), AI, push, upload. 2 demo trips (Patagonia, Japan) + posts.

## 9. Known quirks / edge cases to probe
slug autogen `entwurf-{uuid}`; trip RLS scoping for collaborators; comment pagination (200 then load-earlier); reaction dedupe by token; inline `[photo:ID]`/`[ask:ID]` parsed at save; quiz correct-answer never sent on GET; soft-hide vs hard-delete comments; EXIF lat/lng auto-fill; async translation + ISR revalidate; one-level reply nesting.
