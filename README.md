# Sojourn

**A bold, immersive travel journal.** Sojourn is a self-hostable blog/journal for documenting your travels — full-bleed hero imagery, interactive maps with route lines, photo galleries with a lightbox, reactions, comments, and full-text search. It's built to feel like a magazine and run like a single, portable container.

### [→ Try the live demo](https://sojourn-demo.vercel.app)

Four invented journeys, eighteen entries, real routes on real roads. **No sign-up:
press “Explore the demo” on [the admin login](https://sojourn-demo.vercel.app/admin/login)
and you're inside the editor** — every screen, with the content already there.

The demo is read-only, so it stays as the last person found it. Everything else
works: browse the maps and galleries, react to an entry, vote in a poll.

> **Where this is: v0.1.** I run it for my own journal and it works, but it is
> young. Expect schema churn between releases (migrations apply themselves, so
> that mostly means "redeploy"), expect rough edges away from the paths I use
> daily, and read the release notes before updating. Issues and PRs welcome.

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
supabase start               # boots local Postgres + Auth + Storage, applies migrations + seed.sql
cp .env.example .env.local   # then fill in the printed local URL + anon key
npm run dev
```

Open **http://localhost:3000**. `supabase/seed.sql` populates sample trips, posts, photos, comments and two accounts, so the site is fully exercised in development.

**Sign in at `/admin/login` with:**

| Email | Password | Role |
| --- | --- | --- |
| `owner@sojourn.test` | `sojourn-admin` | owner — sees everything |
| `collab@sojourn.test` | `sojourn-collab` | member — granted two trips |

These are local development fixtures, in the repo on purpose, and they only ever exist in a database built by `supabase/seed.sql`. A real install has no seeded accounts: you create the owner yourself on first run.

> Already ran `supabase start` before? `supabase db reset` rebuilds the database from `supabase/migrations` and re-applies the seed.

Prefer a hosted project? See **Going live with Supabase** below — the only difference is which URL and keys land in `.env.local`.

Other scripts:

```bash
npm run build      # production build (standalone output)
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run migrate:status  # what the database still owes, without applying it
npm run gen:vapid  # generate a VAPID key pair (web-push)
```

> **Heads-up:** `npm run build` applies any pending database migrations first,
> against whatever `DATABASE_URL` (or `.env.local`) points at. That is the point
> — schema arrives with the code that needs it — but it does mean a local
> production build migrates the database it is configured for. It prints the host
> it connected to as its first line; check that line if you keep more than one
> database around.

## Architecture

- **Content is public-read.** Trips, posts, photos, maps, comments, and reactions are shared by URL — there are no viewer accounts.
- **Only `/admin` is gated.** Authentication is Supabase Auth for a single admin, enforced by Next middleware in `src/middleware.ts`. On a fresh install, `/admin/setup` lets the first visitor claim the owner account (atomic via a single-owner unique index; a permanent redirect-to-login tombstone once an owner exists).
- **Data access layer:** `src/lib/content.ts` — public reads via a cookieless anon client (RLS-bounded); query failures return empty, never fabricated content.
- **Schema, RLS, and storage:** `supabase/migrations/` — 44 files applied in the order declared by `src/lib/migrations.mjs`. `0001_init.sql` is where it starts, not the whole of it.

### Database tables

`trips`, `posts` (with a generated `tsvector` search column `search_tsv`), `locations` (map pins), `photos`, `tracks` (GPX), `comments`, `comment_likes`, `reactions`, `interactions` + `interaction_responses` (polls and quizzes), `profiles`, `trip_members`, `member_invites`, `site_settings`, `app_secrets`, `post_chunks`, `post_ai_drafts`, `ai_usage`, `ai_jobs`, `push_subscriptions`, `notifications`.

## Going live with Supabase

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Give Sojourn the database URL, and it runs its own migrations.** Copy the
   **direct** connection string — Supabase dashboard → **Project Settings →
   Database → Connection string → URI**, port **5432**, not the transaction
   pooler on 6543 — and set it as `DATABASE_URL`:
   ```bash
   DATABASE_URL=postgresql://postgres:PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres
   ```
   Every build and every container start now applies whatever the database is
   missing, in order, before the app that needs it starts — an empty project
   gets all ~40 files; a project that is already current gets nothing. There is
   no button to press and no step to forget, which is the point: the schema can
   no longer fall behind the code. See
   [ADR-0002](docs/adr/0002-updates-and-schema-migrations.md).

   On Vercel this is **only** already done for you if you added Supabase
   through the **Vercel marketplace integration**, which writes a set of
   `POSTGRES_*` variables the runner picks up on its own. If you created the
   project at supabase.com and pasted the keys in yourself — the path described
   just above — you have no such variable and you do need this step. Check
   under **Settings → Environment Variables**: no `POSTGRES_URL_NON_POOLING`
   means no automatic migrations.

   To see what would happen without doing it: `npm run migrate:status`.

   <details>
   <summary>Or apply them with the Supabase CLI instead</summary>

   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```

   > **Pick one and stay with it.** The CLI keeps its own ledger, in its own
   > naming scheme, in `supabase_migrations.schema_migrations`; Sojourn keeps a
   > watermark in `public.sojourn_schema`. Neither can read the other. Running
   > `db push` against a database the runner built will find an empty ledger and
   > try to apply everything again.

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

   </details>
3. **Copy your keys** into `.env.local` (copy `.env.example` first):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only
   ```
4. **Turn off public sign-ups.** Supabase dashboard → **Authentication → Sign In / Providers** → switch off *"Allow new users to sign up"*.

   Sojourn has exactly two kinds of account: the owner, and members the owner adds. Nobody signs themselves up. Left on, anyone can create an account on your project with the anon key that appears in every page — it will not get them a profile, and without one they can do nothing (that is what migration `0043` is for), but there is no reason to hand out sessions at all.

5. **Create the owner account.** Open the site — while it is unclaimed, **every page** redirects to **`/admin/setup`**, where you create the owner account (name your site, pick an email and password) and land signed in. This needs `SUPABASE_SERVICE_ROLE_KEY`.

   On an anon-key-only deploy, create it by hand instead: Supabase dashboard → **Auth → Users → Add user**, then in the **SQL Editor** give that user a profile, because nothing else will:

   ```sql
   insert into public.profiles (id, email, role)
   values ('<the new user id>', '<their email>', 'owner');
   ```

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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgalgtonold%2Fsojourn&project-name=sojourn&repository-name=sojourn&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,DATABASE_URL&envDescription=From%20your%20Supabase%20project%3A%20Settings%20%E2%86%92%20API&envLink=https%3A%2F%2Fgithub.com%2Fgalgtonold%2Fsojourn%23going-live-with-supabase)

The button clones the repo and asks for the three values it can't guess. You
still need a Supabase project with the migrations applied first — see
[Going live with Supabase](#going-live-with-supabase).

> **Don't let Vercel create the database for you.** Vercel's Supabase
> integration offers two paths and **pre-selects the wrong one**: "Create New
> Supabase Account (Vercel Native)" provisions a database that *Vercel* owns and
> invoices. `supabase link` against one is refused — *"your account does not have
> the necessary privileges"* — so you cannot run the migrations, which is step
> two of this guide. Create the project in Supabase yourself, as above.
>
> The integration's other path — **"Link Existing Supabase Account"** — is fine,
> and genuinely convenient: point it at a project you created yourself and it
> syncs the connection variables into Vercel for you, so there is nothing to
> copy. It writes both the classic names and Supabase's newer
> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`; Sojourn
> accepts either, so it works untouched. You still apply the migrations
> yourself, which is why the database has to be yours.

Setting it up by hand instead:

1. Connect the repository in Vercel.
2. Set your environment variables. Mark the `NEXT_PUBLIC_*` ones (URL, anon key, VAPID public key, site name/URL, map style) and the **server-only** ones (`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) accordingly.
3. Deploy.

Sojourn deliberately avoids Vercel-only APIs, so the **exact same project also produces a standard Docker image** (Next standalone output). Vercel is a convenience, not a dependency.

## Deployment — Docker / VPS

```bash
docker compose pull && docker compose up -d
```

Runs the published image from GitHub's registry. Updating later is the same two
commands — and schema migrations apply themselves at container start, so there
is no second step (see
[ADR-0002](docs/adr/0002-updates-and-schema-migrations.md)).

Pin how much change you take unattended with `SOJOURN_TAG` — `0.2.1`, `0.2`,
`v0` or the default `latest`.

To build from source instead — a fork, a patch, an architecture we don't
publish:

```bash
docker compose up -d --build
```

> Expect this to want about a gigabyte of free memory and to take a few minutes,
> which is exactly why the prebuilt image exists.

**Nothing deployment-specific is baked into the image**, including the Supabase
URL and key the browser needs. The server reads its environment on every request
and hands the result to the page, so one image serves any deployment
(`src/lib/public-config.ts`). Set your variables in `.env.local` or through
`docker-compose.yml`; there are no build arguments to pass.

## Moving to a VPS later

This is the whole point of Sojourn's architecture: you can start on hosted infrastructure and move to your own server with **config-only** changes — no rewrite.

There are two pieces, and each is independently portable:

1. **The web app is already a portable container.** Next standalone output means the app has no Vercel-specific runtime requirements. `docker compose up -d --build` on any VPS gives you the same running app.

2. **The data layer is your choice.** Either:
   - **Self-host Supabase** with its official Docker Compose stack, point `DATABASE_URL` at it and let the migration runner apply `supabase/migrations/` on the next build; **or**
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
│       ├── 0001_init.sql     # tables, RLS, full-text search, storage bucket
│       └── …                   # 43 more, applied in manifest order
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
| `DATABASE_URL` | **server only** | Direct Postgres connection (port 5432), used *only* to apply schema migrations at build/container start. The app itself never opens one — it goes through PostgREST, which cannot execute DDL. On Vercel, `POSTGRES_URL_NON_POOLING` from the Supabase integration is picked up instead. Also accepts `SOJOURN_DATABASE_URL` and `POSTGRES_URL`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `SITE_NAME`, `MAP_STYLE_URL`, `VAPID_PUBLIC_KEY`, `SENTRY_DSN_CLIENT`, `ANALYTICS`, `DEMO_MODE` | server, read at **runtime** | The same values as the `NEXT_PUBLIC_*` rows above, without the prefix — and they win when both are set. Reach for these when running a **prebuilt image**: `NEXT_PUBLIC_*` is compiled into the bundle when the image is built, so it cannot describe a container the builder never saw. The server reads these per request and hands them to the browser (`src/lib/public-config.ts`). Building from source or deploying on Vercel? The prefixed names are fine and nothing changes. |
| `SOJOURN_RELEASE_REPO` | server | Which GitHub repo the Updates page checks for a newer release. Defaults to upstream; set it if you maintain a real downstream fork. |
| `SOJOURN_RUNTIME` | server | Set to `docker` by our own Dockerfile so the Updates page can name the right update command for the host. Nothing else reads it. |
| `EDGE_SHARED_SECRET` | **server only** | Shared secret authenticating Next.js → the Supabase Edge Functions (`llm-call`, `translate`). Unset means slow generations run inline instead. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | public | `de` (default) or `en` — the language the site serves before a visitor picks one. |
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
| `NEXT_PUBLIC_ANALYTICS` | public | Set to `vercel` to enable Vercel Web Analytics. Unset = no analytics, no script, no request. See "Telemetry" below. |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Browser error reporting. Unset = the Sentry SDK is never loaded. |
| `SENTRY_DSN` | **server only** | Server + edge error reporting. Separate from the browser one on purpose. |

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **required** — the app fails fast without them. Everything else is optional; add each to progressively enable admin/server actions, push, and the AI features. The DeepSeek/embeddings/vision values (except `EMBEDDING_DIM`) can also be set from `/admin/settings` instead of the environment — see "How configuration works" above.

## Telemetry

**Sojourn sends nothing anywhere by default.** No analytics, no error reporting,
no phoning home — not to Vercel, not to Sentry, not to the people who wrote it.
A fresh install talks to your Supabase project, your map tile provider, and
nobody else.

Three switches turn parts of that on, each independently, each yours:

| Set this | And you get |
| --- | --- |
| `NEXT_PUBLIC_ANALYTICS=vercel` | Vercel Web Analytics (cookieless page views). Only useful when hosting on Vercel. |
| `NEXT_PUBLIC_SENTRY_DSN=…` | Errors from your readers' **browsers** reported to your Sentry project. |
| `SENTRY_DSN=…` | Errors from **your server** reported to your Sentry project. |

Leave one unset and the corresponding library is never even downloaded — not
loaded-but-inert, absent. The browser and server Sentry variables are separate
deliberately: shipping your own server's stack traces to a third party is a
smaller decision than shipping your visitors' errors, and the two shouldn't be
made with one switch.

If you enable any of them and your readers are in the EU, that is now your
processing to disclose. Which is exactly why none of it is on for you already.

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
