# Configuring Sojourn

Two variables are required. Everything else is a feature you can choose to have.

## How it works

Supabase (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) is
**required** — the Supabase client wrappers throw a clear error if it's missing,
so a misconfigured deploy fails fast instead of silently serving nothing.

Every other integration is **optional** and gated at runtime by a capability
flag, so the app degrades gracefully feature-by-feature:

| Flag | Turns on | Defined in |
| --- | --- | --- |
| `isServiceRoleConfigured` | admin/server actions + inline polls/quizzes (these bypass RLS) | `src/lib/env.ts` |
| `isPushConfigured` | web push (VAPID keys present) | `src/lib/env.ts` |
| `isAiConfigured` / `isEmbeddingsConfigured` / `isVisionConfigured` | AI drafting, semantic search, photo descriptions | `src/lib/ai-config.ts` |
| `isEdgeTranslateConfigured` / `isEdgeJobConfigured` | background translation + slow LLM offload | `src/lib/env.ts` |

As you add the relevant variables, each subsystem switches on automatically — no
code changes, no feature flags to flip. Semantic search, for example,
transparently falls back to full-text when no embeddings provider is set.

## AI provider config can be set in the UI

The DeepSeek, embeddings and vision keys, base URLs and model IDs are editable at
`/admin/settings` (owner only). A value set there is stored in the `app_secrets`
table and **overrides** the matching environment variable; clearing it falls back
to the environment, then to a built-in default (see `src/lib/ai-config-fields.ts`
for the exact precedence and defaults).

This means a self-hosted deploy can be configured without a redeploy, and the
same key reaches both the app and the Supabase Edge Functions. `app_secrets` has
RLS enabled with no policies and grants revoked from `anon`/`authenticated`, so
only the service role can read it.

`EMBEDDING_DIM` and the `AI_PRICE_*` cost-meter rates are the exceptions — they
stay env-only (see `.env.example`).

## Enabling web push

Web push lets the admin receive notifications, e.g. on new comments.

1. Generate VAPID keys:

   ```bash
   npm run gen:vapid
   ```

2. Put the keys in your environment:

   ```bash
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
   VAPID_PRIVATE_KEY=your-private-key
   VAPID_SUBJECT=mailto:you@example.com
   ```

3. Open **`/admin`** and click **"Enable notifications"**. The service worker
   (`public/sw.js`) registers the subscription, which is stored in the
   `push_subscriptions` table.

## Environment variables

### Required

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key for public-read data. |

Without these the app fails fast rather than starting up empty.

### Server and database

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS for admin/API routes. Never expose to the browser. |
| `DATABASE_URL` | **server only** | Direct Postgres connection (port 5432), used *only* to apply schema migrations at build/container start. The app itself never opens one — it goes through PostgREST, which cannot execute DDL. On Vercel, `POSTGRES_URL_NON_POOLING` from the Supabase integration is picked up instead. Also accepts `SOJOURN_DATABASE_URL` and `POSTGRES_URL`. |
| `SETUP_WINDOW_MINUTES` | server | How long a fresh install stays claimable. Default `60`; `0` disables the guard. See [the claim window](deployment.md#the-claim-window). |
| `TRUST_PROXY_HEADERS` | server | Set to `1` only if a reverse proxy you control sits in front and both **sets** `x-forwarded-for` and **strips** any inbound copy. See [rate limits and client identity](#rate-limits-and-client-identity). Automatic on Vercel. |
| `EDGE_SHARED_SECRET` | **server only** | Shared secret authenticating Next.js → the Supabase Edge Functions (`llm-call`, `translate`). Must be set to the *same value* in both places: your deployment's environment, and the function secrets (`supabase secrets set`). Unset means slow generations run inline instead. |
| `SOJOURN_RELEASE_REPO` | server | Which GitHub repo the Updates page checks for a newer release. Defaults to upstream; set it if you maintain a real downstream fork. |
| `SOJOURN_RUNTIME` | server | Set to `docker` by our own Dockerfile so the Updates page can name the right update command for the host. Nothing else reads it. |
| `SOURCE_URL` | server | Where the footer's AGPL §13 source link points. Defaults to this repository; change it if you deploy a modified version. |

### Site identity

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical site URL. |
| `NEXT_PUBLIC_SITE_NAME` | public | Display name of the site. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | public | `de` (default) or `en` — the language the site serves before a visitor picks one. |
| `NEXT_PUBLIC_MAP_STYLE_URL` | public | MapLibre style URL (defaults to OpenFreeMap, keyless). |

### Web push

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | VAPID public key for push subscriptions. |
| `VAPID_PRIVATE_KEY` | **server only** | VAPID private key for sending push. |
| `VAPID_SUBJECT` | server | Contact (e.g. `mailto:you@example.com`) for push. |

### AI features

All optional, and all except `EMBEDDING_DIM` can be set from `/admin/settings`
instead.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL_FAST` / `DEEPSEEK_MODEL_REASONER` | server | AI drafting provider. Without an API key the AI features are off. |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` | server | OpenAI-compatible embeddings endpoint for semantic search. |
| `EMBEDDING_DIM` | server | Embedding vector size. **Env-only** — must match the DB `vector()` column (`supabase/migrations/0010_hybrid_search.sql`); changing it via a UI control would silently corrupt search. |
| `VISION_API_KEY` / `VISION_BASE_URL` / `VISION_MODEL` | server | Photo-description provider (DeepSeek has no image input). Falls back to the embeddings provider when unset. |

### Telemetry switches

All three are off unless set — see [Telemetry](#telemetry) for what each one
actually sends.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_ANALYTICS` | public | Set to `vercel` to enable Vercel Web Analytics. Unset = no analytics, no script, no request. |
| `NEXT_PUBLIC_SENTRY_DSN` | public | Browser error reporting. Unset = the Sentry SDK is never loaded. |
| `SENTRY_DSN` | **server only** | Server + edge error reporting. Separate from the browser one on purpose. |

## Rate limits and client identity

The public endpoints — comments, reactions, likes, search, poll votes, push
subscriptions, first-run setup — are rate limited per client. Identifying the
client means reading `x-forwarded-for`, and whether that header can be believed
depends entirely on what is in front of Sojourn.

**With nothing in front, it cannot.** The header is then just something the
caller typed, so trusting it would let anyone skip the limits by sending a
different value on each request. Sojourn therefore ignores it unless told
otherwise, and counts unidentified traffic against a single shared ceiling —
twenty times the per-client allowance, which makes it a guard against a flood
rather than a rule about individuals.

**Set `TRUST_PROXY_HEADERS=1` when you have a proxy you control** that sets
`x-forwarded-for` *and* strips whatever arrived with the request. Both halves
matter: the header is read left-to-right, so a proxy that only appends leaves
the forged value in front of the real one. With it set, each visitor gets their
own allowance again.

On **Vercel** this is automatic — the platform sets the header itself and
overwrites any inbound copy, so it is authoritative there and no configuration
is needed.

## Running a prebuilt image

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `SITE_NAME`, `MAP_STYLE_URL`,
`VAPID_PUBLIC_KEY`, `SENTRY_DSN_CLIENT`, `ANALYTICS` and `DEMO_MODE` are the same
values as the `NEXT_PUBLIC_*` rows above, without the prefix — **and they win when
both are set.**

Reach for these when running a **prebuilt image**: `NEXT_PUBLIC_*` is compiled
into the bundle when the image is built, so it cannot describe a container the
builder never saw. The server reads the unprefixed names per request and hands
them to the browser (`src/lib/public-config.ts`).

Building from source or deploying on Vercel? The prefixed names are fine and
nothing changes.

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
