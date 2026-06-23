# Sojourn

**A bold, immersive travel journal.** Sojourn is a self-hostable blog/journal for documenting your travels — full-bleed hero imagery, interactive maps with route lines, photo galleries with a lightbox, reactions, comments, and full-text search. It's built to feel like a magazine and run like a single, portable container.

Sojourn needs one thing to run: **Supabase** (Postgres + Auth + Storage). Point it at a local stack (`supabase start`) or a hosted project, run the migrations, and you have a working site. Everything beyond that — web push, AI authoring, semantic search, photo vision — is **optional** and lights up as you add the relevant keys. Nothing is locked to a single cloud vendor.

## Features

- **Immersive home / hero** with cinematic layout and motion (framer-motion).
- **Post pages** with photo gallery + lightbox and scroll-driven story maps.
- **Interactive trip maps** (MapLibre GL, keyless via OpenFreeMap) with pins, route lines, and a full-screen journey explorer.
- **GPX tracks** with distance + elevation profiles.
- **Reactions** — heart, fire, wow, star.
- **Comments** with replies, likes, and an admin **moderation** surface.
- **Interactive blocks** — inline polls and quizzes inside posts.
- **Full-text search** across posts (Postgres `tsvector`).
- **`/trips` and `/map`** index views.
- **Admin dashboard** (`/admin`) — create/edit trips & posts, a rich editor, direct **photo upload** to Supabase Storage (with EXIF/GPS extraction), and per-trip **collaborators**.
- **AI authoring** (optional, DeepSeek) — staged drafting pipeline, photo enrichment/captioning, with a token-cost meter.
- **Internationalization** — German default with a DE/EN switcher across the whole UI.
- **Web Push notifications** (VAPID) for the admin and subscribers.
- **Installable PWA** — offline caching of visited pages and assets, add-to-home-screen.
- **Portable by design** — Next.js standalone output, Dockerized, no vendor lock-in.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**, all under `src/`.
- **Tailwind CSS v4** — CSS-first config in `src/app/globals.css` via `@tailwindcss/postcss`.
- **Supabase** — Postgres + Auth (single admin) + Storage (photos bucket) + data/realtime.
- **MapLibre GL** — keyless interactive maps (default tiles: OpenFreeMap).
- **Web Push (VAPID)** — admin notifications, service worker at `public/sw.js`.
- **framer-motion**, **lucide-react**, **zod**.
- **Docker** — multi-stage `Dockerfile` (Next standalone) + `docker-compose.yml`.

## How configuration works

Supabase (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) is **required** — the Supabase client wrappers throw a clear error if it's missing, so a misconfigured deploy fails fast instead of silently serving nothing.

Every other integration is **optional** and gated at runtime by a capability flag in `src/lib/env.ts`, so the app degrades gracefully feature-by-feature:

- `isServiceRoleConfigured` — admin/server actions + inline polls/quizzes (bypass RLS).
- `isPushConfigured` — VAPID keys present for web push.
- `isAiConfigured` / `isEmbeddingsConfigured` / `isVisionConfigured` — AI drafting, semantic search, photo descriptions.
- `isEdgeTranslateConfigured` / `isEdgeJobConfigured` — background translation + slow LLM offload.

As you add the relevant env vars, each subsystem switches on automatically — no code changes, no feature flags to flip. (Semantic search, for example, transparently falls back to full-text when no embeddings provider is set.)

## Quick start

You need a Supabase to point at. The fastest path is the local stack (requires Docker + the Supabase CLI):

```bash
npm install
supabase start          # boots local Postgres + Auth + Storage
supabase db reset        # applies migrations in supabase/migrations + seed.sql
cp .env.example .env.local   # then fill in the printed local URL + anon key
npm run dev
```

Open **http://localhost:3000**. `supabase/seed.sql` populates sample trips, posts, photos, comments, and two admin users so the site is fully exercised in development. Prefer a hosted project instead? See **Going live with Supabase** below — the only difference is which URL/keys land in `.env.local`.

Other scripts:

```bash
npm run build      # production build (standalone output)
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run gen:vapid  # generate a VAPID key pair (web-push)
```

## Architecture

- **Content is public-read.** Trips, posts, photos, maps, comments, and reactions are shared by URL — there are no viewer accounts.
- **Only `/admin` is gated.** Authentication is Supabase Auth for a single admin, enforced by Next middleware in `src/middleware.ts`.
- **Data access layer:** `src/lib/content.ts` — public reads via a cookieless anon client (RLS-bounded); query failures return empty, never fabricated content.
- **Schema, RLS, and storage:** `supabase/migrations/0001_init.sql`.

### Database tables

`trips`, `posts` (with a generated `tsvector` full-text search column `search_tsv`), `locations` (map pins), `photos`, `comments`, `reactions`, `push_subscriptions`, `notifications`.

## Going live with Supabase

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the migration.** Apply `supabase/migrations/0001_init.sql` — either paste it into the Supabase **SQL Editor**, or push it with the CLI:
   ```bash
   supabase db push
   ```
   This creates all tables, the full-text search column, row-level security policies, and the `photos` storage bucket.
3. **Copy your keys** into `.env.local` (copy `.env.example` first):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only
   ```
4. **Create the admin user.** In the Supabase dashboard go to **Auth → Users → Add user** and create one user with an email + password. That's your single admin login for `/admin`.

> Because content is public-read, **no viewer accounts are ever needed** — the only account that exists is the admin.

Restart `npm run dev` and the site reads from your hosted database.

## Enabling web push

Web push lets the admin receive notifications (e.g. on new comments).

1. Generate VAPID keys:
   ```bash
   npm run gen:vapid
   ```
2. Put the keys in your env:
   ```bash
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
   VAPID_PRIVATE_KEY=your-private-key
   VAPID_SUBJECT=mailto:you@example.com
   ```
3. Open **`/admin`** and click **"Enable notifications"**. The service worker (`public/sw.js`) registers the subscription, which is stored in the `push_subscriptions` table.

## Deployment — Cloud (Vercel)

1. Connect the repository in Vercel.
2. Set your environment variables. Mark the `NEXT_PUBLIC_*` ones (URL, anon key, VAPID public key, site name/URL, map style) and the **server-only** ones (`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) accordingly.
3. Deploy.

Sojourn deliberately avoids Vercel-only APIs, so the **exact same project also produces a standard Docker image** (Next standalone output). Vercel is a convenience, not a dependency.

## Deployment — Docker / VPS

```bash
docker compose up -d --build
```

This builds the multi-stage `Dockerfile` and runs the Next standalone server. Pass your env vars through `docker-compose.yml` or an env file. **This is the same image that runs in the cloud** — what you test locally in Docker is exactly what ships.

## Moving to a VPS later

This is the whole point of Sojourn's architecture: you can start on hosted infrastructure and move to your own server with **config-only** changes — no rewrite.

There are two pieces, and each is independently portable:

1. **The web app is already a portable container.** Next standalone output means the app has no Vercel-specific runtime requirements. `docker compose up -d --build` on any VPS gives you the same running app.

2. **The data layer is your choice.** Either:
   - **Self-host Supabase** with its official Docker Compose stack, run the same `supabase/migrations/0001_init.sql`, and point the app's env vars at it; **or**
   - **Keep hosted Supabase** and just move the web container — the database doesn't have to move at all.

Because we avoided proprietary lock-in (keyless maps, standard Postgres, a vanilla Next build), migration comes down to **pointing your env vars at the new Postgres/Supabase and running the same migration SQL**. The application code is identical in every environment.

## Project structure

```
sojourn/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── admin/            # single-admin dashboard (auth-gated)
│   │   ├── api/              # route handlers (push, actions)
│   │   ├── map/              # global map view
│   │   ├── posts/            # post pages
│   │   ├── search/           # full-text search
│   │   ├── trips/            # trips index
│   │   ├── globals.css       # Tailwind v4 CSS-first config
│   │   ├── layout.tsx
│   │   └── page.tsx          # immersive home / hero
│   ├── components/           # UI: gallery, trip-map, reactions, comments, post-editor, push-toggle, …
│   ├── lib/
│   │   ├── supabase/         # client.ts, server.ts, admin.ts
│   │   ├── content.ts        # data access layer (Supabase, RLS-bounded reads)
│   │   ├── env.ts            # isSupabaseConfigured / isServiceRoleConfigured / isPushConfigured
│   │   ├── notify.ts         # web push helpers
│   │   ├── types.ts
│   │   └── utils.ts
│   └── middleware.ts         # gates /admin via Supabase Auth
├── supabase/
│   └── migrations/
│       └── 0001_init.sql     # tables, RLS, full-text search, storage bucket
├── public/
│   └── sw.js                 # web push service worker
├── Dockerfile                # multi-stage, Next standalone
├── docker-compose.yml
└── .env.example
```

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key for public-read data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS for admin/API routes. Never expose to the browser. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | VAPID public key for web push subscriptions. |
| `VAPID_PRIVATE_KEY` | **server only** | VAPID private key for sending push. |
| `VAPID_SUBJECT` | server | Contact (e.g. `mailto:you@example.com`) for push. |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL. |
| `NEXT_PUBLIC_SITE_NAME` | public | Display name of the site. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | public | MapLibre style URL (defaults to OpenFreeMap, keyless). |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **required** — the app fails fast without them. Everything else is optional; add each to progressively enable admin/server actions, push, and the AI features.

## Roadmap

Built and working, but room to grow:

- **Map clustering** — cluster pins on the global `/map` as trips accumulate.
- **Discoverability** — `sitemap.xml`, `robots.txt`, JSON-LD, and canonical/`hreflang` for the bilingual site.
- **Share surface** — dynamic per-post Open Graph images and a native share sheet.

> Several earlier roadmap items — direct **photo upload**, a **comment moderation** UI, **rich Markdown** post bodies, **AI authoring**, **collaborators**, and **i18n** — are now implemented and listed under [Features](#features).
