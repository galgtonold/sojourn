// Centralized, typed access to environment configuration.
// The app is designed to run with NONE of these set (demo mode), so every
// getter is defensive and `isSupabaseConfigured` gates real data access.

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
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

  // DeepSeek (AI drafting). Model IDs are configurable so naming never blocks.
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  deepseekModelFast: process.env.DEEPSEEK_MODEL_FAST ?? "deepseek-chat",
  deepseekModelReasoner:
    process.env.DEEPSEEK_MODEL_REASONER ?? "deepseek-reasoner",
  deepseekModelVision: process.env.DEEPSEEK_MODEL_VISION ?? "deepseek-chat",
  // Pricing for the cost meter — USD per 1M tokens (override to match DeepSeek).
  aiPriceCacheHit: Number(process.env.AI_PRICE_INPUT_CACHE_HIT_USD ?? "0.07"),
  aiPriceCacheMiss: Number(process.env.AI_PRICE_INPUT_CACHE_MISS_USD ?? "0.27"),
  aiPriceOutput: Number(process.env.AI_PRICE_OUTPUT_USD ?? "1.10"),
};

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);

export const isServiceRoleConfigured = Boolean(
  isSupabaseConfigured && env.supabaseServiceRoleKey,
);

export const isPushConfigured = Boolean(
  env.vapidPublicKey && env.vapidPrivateKey,
);

export const isAiConfigured = Boolean(env.deepseekApiKey);
