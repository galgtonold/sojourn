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
  deepseekModelFast: process.env.DEEPSEEK_MODEL_FAST ?? "deepseek-v4-flash",
  deepseekModelReasoner:
    process.env.DEEPSEEK_MODEL_REASONER ?? "deepseek-v4-pro",
  deepseekModelVision: process.env.DEEPSEEK_MODEL_VISION ?? "deepseek-v4-flash",
  // Pricing for the cost meter — USD per 1M tokens (override to match DeepSeek).
  aiPriceCacheHit: Number(process.env.AI_PRICE_INPUT_CACHE_HIT_USD ?? "0.07"),
  aiPriceCacheMiss: Number(process.env.AI_PRICE_INPUT_CACHE_MISS_USD ?? "0.27"),
  aiPriceOutput: Number(process.env.AI_PRICE_OUTPUT_USD ?? "1.10"),

  // Embeddings power the semantic half of hybrid search. DeepSeek has no
  // embeddings API, so this is a separate, OpenAI-compatible /embeddings
  // endpoint — point EMBEDDING_BASE_URL at Ollama / TEI / llama.cpp to self-host
  // it keylessly. The column dimension in the DB must match `embeddingDim`.
  embeddingApiKey:
    process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? "https://api.openai.com/v1",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? "1536"),
  // Embedding price — USD per 1M input tokens (text-embedding-3-small default).
  aiPriceEmbedding: Number(process.env.AI_PRICE_EMBEDDING_USD ?? "0.02"),

  // Vision (photo descriptions). DeepSeek's API has no image input, so photo
  // descriptions go through a separate OpenAI-compatible chat endpoint. Defaults
  // to the same provider that already serves embeddings (typically OpenAI) with
  // a vision-capable model — set VISION_* to point elsewhere.
  visionApiKey:
    process.env.VISION_API_KEY ??
    process.env.EMBEDDING_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "",
  visionBaseUrl:
    process.env.VISION_BASE_URL ??
    process.env.EMBEDDING_BASE_URL ??
    "https://api.openai.com/v1",
  visionModel: process.env.VISION_MODEL ?? "gpt-4o-mini",
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

// Semantic search is optional: without it, hybrid search transparently becomes
// pure full-text search (see search_*_hybrid RPCs and the content layer).
export const isEmbeddingsConfigured = Boolean(env.embeddingApiKey);

// Photo descriptions need a vision-capable model (DeepSeek has none); enabled as
// soon as a key is available (it falls back to the embeddings provider).
export const isVisionConfigured = Boolean(env.visionApiKey);
