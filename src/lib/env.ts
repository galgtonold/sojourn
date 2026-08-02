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

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Both spellings are accepted so a Vercel + Supabase Marketplace deploy works
  // with the variables that integration writes, unchanged (see @/lib/env-aliases).
  //
  // Each `process.env.NEXT_PUBLIC_*` must be written out literally here: Next
  // inlines those by textual substitution at build time, so handing the whole
  // `process.env` object to a helper would leave the browser bundle with
  // nothing to read.
  supabaseAnonKey: pickSupabaseKey({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }),
  supabaseServiceRoleKey: pickServiceKey({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }),
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  // Prefer an explicit URL; otherwise use Vercel's stable production domain
  // (set automatically on Vercel), falling back to localhost in dev.
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "Sojourn",
  mapStyleUrl:
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    "https://tiles.openfreemap.org/styles/liberty",

  // ── Telemetry, both off unless the operator turns them on ────────────────
  //
  // Sojourn is meant to be self-hosted, often for a journal about the author's
  // own life, so nothing here may phone anywhere by default. Each switch is a
  // separate decision the operator makes for their own deployment — and when
  // unset, the corresponding library is never even loaded (see
  // @/components/site-analytics and instrumentation-client.ts).
  //
  // "vercel" is the only value that does anything today; anything else, blank
  // included, means no analytics at all.
  analytics: process.env.NEXT_PUBLIC_ANALYTICS ?? "",
  // Whether this deployment is running ON Vercel. Vercel sets it; nothing else
  // does. Matters because Vercel Analytics is served by their platform, so the
  // option is meaningless — and actively harmful, a 404 per page view —
  // anywhere else. Server-side only, which is where the decision is made.
  onVercel: Boolean(process.env.VERCEL),
  // Browser error reporting. The SERVER side has its own, unrelated SENTRY_DSN
  // (sentry.server.config.ts) — deliberately separate, because sending your
  // own server's stack traces somewhere is a much smaller decision than
  // sending your readers' browser errors.
  sentryDsnClient: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",

  // The public showcase deployment: read-only for everyone, with a one-click
  // sign-in so visitors can see the admin without an account. NEXT_PUBLIC_
  // because the login page (a client component) has to know whether to offer
  // the button. Unset everywhere else, which leaves every demo path inert.
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "1",
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
  edgeFunctionUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/llm-call`
    : "",
  edgeTranslateUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/translate`
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
