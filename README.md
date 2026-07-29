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

Every other integration is **optional** and gated at runtime by a capability flag, so the app degrades gracefully feature-by-feature:

- `isServiceRoleConfigured` — admin/server actions + inline polls/quizzes (bypass RLS). (`src/lib/env.ts`)
- `isPushConfigured` — VAPID keys present for web push. (`src/lib/env.ts`)
- `isAiConfigured` / `isEmbeddingsConfigured` / `isVisionConfigured` — AI drafting, semantic search, photo descriptions. (`src/lib/ai-config.ts` — `getAiConfig()`, resolved from `src/lib/ai-config-fields.ts`)
- `isEdgeTranslateConfigured` / `isEdgeJobConfigured` — background translation + slow LLM offload. (`src/lib/env.ts`)

As you add the relevant env vars, each subsystem switches on automatically — no code changes, no feature flags to flip. (Semantic search, for example, transparently falls back to full-text when no embeddings provider is set.)

**AI provider config can be set in the UI.** The DeepSeek, embeddings and vision
keys, base URLs and model IDs are editable at `/admin/settings` (owner only). A
value set there is stored in the `app_secrets` table and **overrides** the
matching environment variable; clearing it falls back to the environment, then
to a built-in default (see `src/lib/ai-config-fields.ts` for the exact
precedence and defaults). This means a self-hosted deploy can be configured
without a redeploy, and the same key reaches both the app and the Supabase Edge
Functions (`supabase/functions/_shared/config.ts`). `app_secrets` has RLS
enabled with no policies and grants revoked from `anon`/`authenticated`, so only
the service role can read it. `EMBEDDING_DIM` and the `AI_PRICE_*` cost-meter
rates are the exceptions — they stay env-only (see `.env.example`).

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

> **Heads-up:** `next build`/`next start` run with `NODE_ENV=production`, so they
> load `.env.production` — which points at the **live** Supabase. A local
> production build therefore reads (and could write to) production data. Use
> `npm run dev` (which loads `.env.local`) for local development; don't run
> write-flow tests against a local production build.

## Architecture

- **Content is public-read.** Trips, posts, photos, maps, comments, and reactions are shared by URL — there are no viewer accounts.
- **Only `/admin` is gated.** Authentication is Supabase Auth for a single admin, enforced by Next middleware in `src/middleware.ts`. On a fresh install, `/admin/setup` lets the first visitor claim the owner account (atomic via a single-owner unique index; a permanent redirect-to-login tombstone once an owner exists).
- **Data access layer:** `src/lib/content.ts` — public reads via a cookieless anon client (RLS-bounded); query failures return empty, never fabricated content.
- **Schema, RLS, and storage:** `supabase/migrations/0001_init.sql`.

### Database tables

`trips`, `posts` (with a generated `tsvector` full-text search column `search_tsv`), `locations` (map pins), `photos`, `comments`, `reactions`, `push_subscriptions`, `notifications`.

## Going live with Supabase

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the migrations.** Point the CLI at your project and push everything in
   `supabase/migrations` (there are ~40 files — apply them all, in order):
   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```
   This creates all tables, the full-text search column, row-level security
   policies, and the `photos` storage bucket.

   > **`db push` can be noisy and still have worked.** Some CLI versions print a
   > wall of certificate / edge-runtime errors and then say `Finished supabase db
   > push.` — the migrations have usually applied fine. Don't retry blindly;
   > check first. In the Supabase dashboard the **Table Editor** should list
   > `trips`, `posts`, `photos` and friends, or run this in the **SQL Editor**:
   > ```sql
   > select count(*) as applied from supabase_migrations.schema_migrations;
   > ```
   > It should match the number of files in `supabase/migrations`. If it does,
   > you're done — the errors were noise.
3. **Copy your keys** into `.env.local` (copy `.env.example` first):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only
   ```
4. **Create the owner account.** Open the site — while it is unclaimed, **every page** redirects to **`/admin/setup`**, where you create the owner account (name your site, pick an email and password) and land signed in. This needs `SUPABASE_SERVICE_ROLE_KEY`; on an anon-key-only deploy, create the user manually instead: Supabase dashboard → **Auth → Users → Add user**.

   > **Claim it before you point a domain at it.** The first visitor to a fresh install becomes its owner, and newly issued TLS certificates are published publicly (Certificate Transparency), so a custom domain is discoverable within minutes. Claiming on the `*.vercel.app` URL first avoids the race entirely. As a backstop, the claim is only open for **60 minutes** after the schema is installed — see below.

> Because content is public-read, **no viewer accounts are ever needed** — the only account that exists is the admin.

### The claim window

An unclaimed install can be claimed by whoever reaches it first, so that state is
deliberately short-lived: **60 minutes** from the moment the schema is installed
(`site_settings.setup_opened_at`). After that `/admin/setup` explains itself and
stops accepting a claim, so a half-finished deploy can't sit there indefinitely
waiting to be adopted.

Missed the window? **Restart the server (Docker) or redeploy (Vercel)** — an
unclaimed install opens a fresh window for a deployment it hasn't seen before.
That isn't a loophole: only whoever controls the deployment can restart it, so
it proves the same thing a setup token would, without a secret to store. Note
this tracks the *deployment*, not the process — serverless cold starts happen
constantly and deliberately don't count.

If restarting is awkward, the expired page also prints the manual way back in:

```sql
update public.site_settings set setup_opened_at = now() where id = 1;
```

Tune it with `SETUP_WINDOW_MINUTES` (default `60`; `0` disables the guard, which
is reasonable on a LAN). Claiming also clears any stored AI provider config, so
a reclaimed install never inherits credentials or endpoints from whoever held it
before. Note this bounds neglect, not a determined attacker: someone who reaches
`/admin/setup` inside the window can still claim it. If that matters for your
deployment, claim the install immediately and keep it off a public domain until
you have.

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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgalgtonold%2Fsojourn&project-name=sojourn&repository-name=sojourn&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&envDescription=From%20your%20Supabase%20project%3A%20Settings%20%E2%86%92%20API&envLink=https%3A%2F%2Fgithub.com%2Fgalgtonold%2Fsojourn%23going-live-with-supabase)

The button clones the repo and asks for the three values it can't guess. You
still need a Supabase project with the migrations applied first — see
[Going live with Supabase](#going-live-with-supabase).

**Or let Vercel create the database for you.** Add the
[Supabase integration](https://vercel.com/marketplace/supabase) from Vercel's
marketplace and it provisions a project and writes the connection variables
itself — no copying. It uses its own names (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`) rather than the ones above; Sojourn accepts both, so
either way works untouched. You still apply the migrations yourself.

Setting it up by hand instead:

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
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` | server | OpenAI-compatible embeddings endpoint for semantic search. Optional — or set in `/admin/settings`. |
| `EMBEDDING_DIM` | server | Embedding vector size. **Env-only** — must match the DB `vector()` column (`supabase/migrations/0010_hybrid_search.sql`); changing it via a UI control would silently corrupt search. |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL_FAST` / `DEEPSEEK_MODEL_REASONER` | server | AI drafting provider. Optional — or set in `/admin/settings`. Without an API key the AI features are off. |
| `VISION_API_KEY` / `VISION_BASE_URL` / `VISION_MODEL` | server | Photo-description provider (DeepSeek has no image input). Optional — or set in `/admin/settings`; falls back to the embeddings provider when unset. |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **required** — the app fails fast without them. Everything else is optional; add each to progressively enable admin/server actions, push, and the AI features. The DeepSeek/embeddings/vision values (except `EMBEDDING_DIM`) can also be set from `/admin/settings` instead of the environment — see "How configuration works" above.

## Roadmap

Built and working, but room to grow:

- **Map clustering** — cluster pins on the global `/map` as trips accumulate.
- **Discoverability** — `sitemap.xml`, `robots.txt`, JSON-LD, and canonical/`hreflang` for the bilingual site.
- **Share surface** — dynamic per-post Open Graph images and a native share sheet.

> Several earlier roadmap items — direct **photo upload**, a **comment moderation** UI, **rich Markdown** post bodies, **AI authoring**, **collaborators**, and **i18n** — are now implemented and listed under [Features](#features).

## License

Sojourn is free software under the **[GNU AGPL-3.0](LICENSE)** (`AGPL-3.0-only`).

- **Self-host it freely, forever.** Run it for yourself or anyone else, and modify it however you like.
- **Offering it as a service?** Also fine — the AGPL simply requires making the source of your modified version available to the people who use it.
- **Want white-label use, closed modifications, or different terms?** Commercial licenses are available — contact Philipp Gergen: <philipp.gergen@web.de>.

Contributions are welcome under a lightweight DCO + relicensing grant — see [CONTRIBUTING.md](CONTRIBUTING.md). The "Sojourn" name and logo are not covered by the code license.
