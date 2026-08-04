// Centralized, typed access to environment configuration.
// Supabase (URL + anon key) is REQUIRED — the app fails fast without it (see the
// Supabase client wrappers, which throw `SUPABASE_NOT_CONFIGURED`). The remaining
// integrations (service role, push, edge functions) are genuinely optional and
// gated by their own `is*Configured` flags.
//
// The AI provider keys, base URLs and model IDs are NOT here: they're settable
// from /admin/settings and so must be read asynchronously — see @/lib/ai-config
// (`getAiConfig`) and @/lib/ai-config-fields. Only `embeddingDim` and the
// `aiPrice*` rates remain, because neither can move.

import { pickSupabaseKey, pickServiceKey } from "@/lib/env-aliases";
import {
  publicConfigFromEnv,
  UPSTREAM_SOURCE_URL,
  injectedPublicConfig,
  mergePublicConfig,
  DEFAULT_MAP_STYLE,
  type PublicConfig,
} from "@/lib/public-config";

// What the build inlined. Each `process.env.NEXT_PUBLIC_*` must be written out
// literally: Next substitutes those textually at build time, so handing the
// whole `process.env` object to a helper would leave the browser bundle with
// nothing to read.
//
// This is now the FALLBACK rather than the source. It still answers for every
// deployment built before the runtime config script existed, and for any page
// somehow served without it — so nothing that works today stops working.
const inlined: PublicConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Both spellings are accepted so a Vercel + Supabase Marketplace deploy works
  // with the variables that integration writes, unchanged (see @/lib/env-aliases).
  supabaseAnonKey: pickSupabaseKey({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }),
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "Sojourn",
  // Prefer an explicit URL; otherwise use Vercel's stable production domain
  // (set automatically on Vercel), falling back to localhost in dev.
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_MAP_STYLE,
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  sentryDsnClient: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "1",
  sourceUrl: process.env.NEXT_PUBLIC_SOURCE_URL || UPSTREAM_SOURCE_URL,
};

// On the server, the environment as it is right now — which in a container is
// the only thing that can be right, since the image was built by someone else.
// In the browser, whatever that server put in the page, falling back to the
// build's own values. See @/lib/public-config for why the two differ.
const publicConfig: PublicConfig =
  typeof window === "undefined"
    ? publicConfigFromEnv(process.env)
    : mergePublicConfig(injectedPublicConfig(), inlined);

export const env = {
  supabaseUrl: publicConfig.supabaseUrl,
  supabaseAnonKey: publicConfig.supabaseAnonKey,
  supabaseServiceRoleKey: pickServiceKey({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }),
  vapidPublicKey: publicConfig.vapidPublicKey,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  siteUrl: publicConfig.siteUrl,
  siteName: publicConfig.siteName,
  // Where this deployment's source lives — AGPL §13 (see public-config).
  sourceUrl: publicConfig.sourceUrl,
  mapStyleUrl: publicConfig.mapStyleUrl,

  // ── Telemetry, both off unless the operator turns them on ────────────────
  //
  // Sojourn is meant to be self-hosted, often for a journal about the author's
  // own life, so nothing here may phone anywhere by default. Each switch is a
  // separate decision the operator makes for their own deployment — and when
  // unset, the corresponding library is never even loaded (see
  // @/components/site-analytics and instrumentation-client.ts).
  //
  // "vercel" is the only value that does anything today; anything else, blank
  // included, means no analytics at all. `ANALYTICS` first so a container can
  // set it without a rebuild; the prefixed spelling still answers for existing
  // deployments. Only ever read on the server — the layout resolves it and
  // passes the answer down as a prop.
  analytics: process.env.ANALYTICS || (process.env.NEXT_PUBLIC_ANALYTICS ?? ""),
  // Whether this deployment is running ON Vercel. Vercel sets it; nothing else
  // does. Matters because Vercel Analytics is served by their platform, so the
  // option is meaningless — and actively harmful, a 404 per page view —
  // anywhere else. Server-side only, which is where the decision is made.
  onVercel: Boolean(process.env.VERCEL),
  // Browser error reporting. The SERVER side has its own, unrelated SENTRY_DSN
  // (sentry.server.config.ts) — deliberately separate, because sending your
  // own server's stack traces somewhere is a much smaller decision than
  // sending your readers' browser errors.
  sentryDsnClient: publicConfig.sentryDsnClient,

  // The public showcase deployment: read-only for everyone, with a one-click
  // sign-in so visitors can see the admin without an account. Reaches the
  // browser because the login page (a client component) has to know whether to
  // offer the button. Unset everywhere else, which leaves every demo path inert.
  demoMode: publicConfig.demoMode,
  // The account that one-click button signs in as. Server-only: the password
  // never reaches the browser (see /api/demo/login).
  demoEmail: process.env.DEMO_EMAIL ?? "",
  demoPassword: process.env.DEMO_PASSWORD ?? "",

  // How many minutes an unclaimed install stays claimable, measured from
  // `site_settings.setup_opened_at`. 0 (or negative) switches the guard off —
  // reasonable on a LAN, where nobody unexpected can reach the setup page.
  setupWindowMinutes: Number(process.env.SETUP_WINDOW_MINUTES ?? "60"),

  // Embedding dimension must match the DB `vector()` column, so it stays here:
  // changing it at runtime from the UI would silently corrupt search.
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? "1536"),
  // Pricing for the cost meter — USD per 1M tokens.
  aiPriceCacheHit: Number(process.env.AI_PRICE_INPUT_CACHE_HIT_USD ?? "0.07"),
  aiPriceCacheMiss: Number(process.env.AI_PRICE_INPUT_CACHE_MISS_USD ?? "0.27"),
  aiPriceOutput: Number(process.env.AI_PRICE_OUTPUT_USD ?? "1.10"),
  aiPriceEmbedding: Number(process.env.AI_PRICE_EMBEDDING_USD ?? "0.02"),

  // Async LLM jobs: slow generations run on the Supabase `llm-call` Edge
  // Function (longer wall-clock than a Vercel function). A shared secret
  // authenticates Next.js → the function. When unset, generation falls back to
  // a synchronous in-route call (current behaviour).
  edgeSharedSecret: process.env.EDGE_SHARED_SECRET ?? "",
  // Derived from the resolved URL rather than the inlined one, so a container
  // pointed at a different Supabase reaches that project's functions too.
  edgeFunctionUrl: publicConfig.supabaseUrl
    ? `${publicConfig.supabaseUrl}/functions/v1/llm-call`
    : "",
  edgeTranslateUrl: publicConfig.supabaseUrl
    ? `${publicConfig.supabaseUrl}/functions/v1/translate`
    : "",
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);

// Thrown by the Supabase client wrappers when the core config is missing. The
// app requires Supabase; this surfaces a misconfigured deploy loudly instead of
// silently serving nothing.
export const SUPABASE_NOT_CONFIGURED =
  "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
  "(or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, which the Vercel Supabase integration sets).";

export const isServiceRoleConfigured = Boolean(
  isSupabaseConfigured && env.supabaseServiceRoleKey,
);

export const isPushConfigured = Boolean(
  env.vapidPublicKey && env.vapidPrivateKey,
);

// Offload slow generations to the Edge Function only when both the secret and
// the function URL are present.
export const isEdgeJobConfigured = Boolean(
  env.edgeSharedSecret && env.edgeFunctionUrl,
);

// Background content translation reuses the same shared secret + a sibling Edge
// Function (`translate`), gated the same way as the job runner above.
export const isEdgeTranslateConfigured = Boolean(
  env.edgeSharedSecret && env.edgeTranslateUrl,
);
