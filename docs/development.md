# Developing Sojourn

## Running it locally

You need a Supabase to point at. The fastest path is the local stack (requires
Docker + the Supabase CLI):

```bash
npm install
```

```bash
supabase start
```

That boots local Postgres + Auth + Storage and applies the migrations and
`seed.sql`. Copy the printed URL and anon key into your env, then start the dev
server:

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open **http://localhost:3000**. `supabase/seed.sql` populates sample trips,
posts, photos, comments and two accounts, so the site is fully exercised in
development.

**Sign in at `/admin/login` with:**

| Email | Password | Role |
| --- | --- | --- |
| `owner@sojourn.test` | `sojourn-admin` | owner — sees everything |
| `collab@sojourn.test` | `sojourn-collab` | member — granted two trips |

These are local development fixtures, in the repo on purpose, and they only ever
exist in a database built by `supabase/seed.sql`. A real install has no seeded
accounts: you create the owner yourself on first run.

> Already ran `supabase start` before? `supabase db reset` rebuilds the database
> from `supabase/migrations` and re-applies the seed.

Prefer a hosted project? See
[Bringing your own Supabase](deployment.md#bringing-your-own-supabase) — the only
difference is which URL and keys land in `.env.local`.

## Scripts

```bash
npm run dev             # dev server
npm run build           # production build (standalone output)
npm run start           # serve the production build
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
npm test                # vitest
npm run test:watch      # vitest, watching
npm run test:coverage   # vitest with V8 coverage
npm run migrate:status  # what the database still owes, without applying it
npm run gen:vapid       # generate a VAPID key pair (web-push)
npm run notices         # regenerate THIRD-PARTY-NOTICES.txt after dependency changes
```

> **Heads-up:** `npm run build` applies any pending database migrations first,
> against whatever `DATABASE_URL` (or `.env.local`) points at. That is the point
> — schema arrives with the code that needs it — but it does mean a local
> production build migrates the database it is configured for. It prints the host
> it connected to as its first line; check that line if you keep more than one
> database around.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:
typecheck, lint, the test suite, a full production build, and a check that the
lockfile resolves under the release image's own npm. The build step gets
placeholder Supabase credentials pointing at a host that answers nothing — every
read fails, the content helpers return empty, and the pages still compile. What
that proves is that the code builds, which is all CI can honestly check without a
database.

CI answers "does it build". A **preview deployment** answers "does it work",
which is a different question and the one a browser has to be involved in — the
upstream deployment gives its Preview environment a seeded demo database so
every branch renders real content without touching anything live. See
[Deployment](deployment.md#vercel) for how that is wired.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**, all under `src/`.
- **Tailwind CSS v4** — CSS-first config in `src/app/globals.css` via `@tailwindcss/postcss`.
- **Supabase** — Postgres + Auth (single admin) + Storage (photos bucket).
- **MapLibre GL** — keyless interactive maps (default tiles: OpenFreeMap).
- **Web Push (VAPID)** — admin notifications, service worker at `public/sw.js`.
- **framer-motion**, **lucide-react**, **zod**.
- **Docker** — multi-stage `Dockerfile` (Next standalone) + `docker-compose.yml`.
- **Vitest** — `test/unit/` and `test/e2e/`.

Node **24.x** (`engines`), which is what CI, the image and Vercel all run.

## Architecture

- **Content is public-read.** Trips, posts, photos, maps, comments, and
  reactions are shared by URL — there are no viewer accounts.
- **Only `/admin` is gated.** Authentication is Supabase Auth for a single admin,
  enforced by Next middleware in `src/middleware.ts`. On a fresh install,
  `/admin/setup` lets the first visitor claim the owner account (atomic via a
  single-owner unique index; a permanent redirect-to-login tombstone once an
  owner exists).
- **Data access layer:** `src/lib/content.ts` — public reads via a cookieless
  anon client (RLS-bounded); query failures return empty, never fabricated
  content.
- **Schema, RLS, and storage:** `supabase/migrations/` — applied in the order
  declared by `src/lib/migrations.mjs`, which is the authoritative list, not
  filename sort order (`00271_…` sorts before `0027_…`). `0001_init.sql` is
  where it starts, not the whole of it.
- **The AI draft pipeline is orchestrated client-side**, deliberately. The full
  run takes minutes across many model calls — longer than a serverless request
  can hold — so the browser sequences the steps and the slow ones offload to a
  Supabase Edge Function via the `ai_jobs` queue.
- **Updating the code is a platform gesture; migrations run themselves.** No
  host we ship to can rebuild itself in place, so `docker compose pull` or a
  redeploy is the update — but the schema that release expects applies at the
  release seam, so the two can never separate.

### Database tables

`trips`, `posts` (with a generated `tsvector` search column `search_tsv`),
`locations` (map pins), `photos`, `tracks` (GPX), `comments`, `comment_likes`,
`reactions`, `interactions` + `interaction_responses` (polls and quizzes),
`profiles`, `trip_members`, `member_invites`, `site_settings`, `app_secrets`,
`post_chunks`, `post_ai_drafts`, `ai_usage`, `ai_jobs`, `push_subscriptions`,
`notifications`.

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
│   ├── components/           # UI: gallery, trip-map, reactions, comments, post-editor, …
│   ├── lib/
│   │   ├── supabase/         # client.ts, server.ts, admin.ts
│   │   ├── content.ts        # data access layer (Supabase, RLS-bounded reads)
│   │   ├── env.ts            # capability flags
│   │   ├── i18n.ts           # ALL user-facing copy, de + en
│   │   ├── notify.ts         # web push helpers
│   │   ├── types.ts
│   │   └── utils.ts
│   └── middleware.ts         # gates /admin via Supabase Auth
├── supabase/
│   ├── functions/            # Deno edge functions (llm-call, translate)
│   └── migrations/
│       ├── 0001_init.sql     # tables, RLS, full-text search, storage bucket
│       └── …                 # 43 more, applied in manifest order
├── scripts/                  # migrate, backup/restore, selfhost-init, notices
├── test/                     # vitest — unit/ and e2e/
├── public/
│   └── sw.js                 # web push service worker
├── Dockerfile                # multi-stage, Next standalone
├── docker-compose.yml
└── .env.example
```

## House rules

- **User-facing copy lives in `src/lib/i18n.ts` (de + en) — never hard-code UI
  strings.** New strings need both languages.
- **Behavior changes come with tests.** Match the existing style in `test/`.
- **Anything touching auth, RLS, or the service-role path gets extra scrutiny.**
  Call it out explicitly in the PR description.

The full contribution process — including the DCO sign-off and relicensing grant
— is in [CONTRIBUTING.md](../CONTRIBUTING.md).
