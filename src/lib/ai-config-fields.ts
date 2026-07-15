// The single owner of the AI provider fields and how a value is resolved.
//
// Each field resolves DB → its own env var → a built-in default. The DB values
// come from `app_secrets` (see @/lib/ai-config); env is the fallback so the
// hosted deploy keeps working with no migration and a self-hoster can still
// seed from a .env file.
//
// This module is PURE — no I/O, no `server-only` — so the precedence rules and
// the cascades are unit-testable, the same split as branding-fields.ts vs
// branding.ts. @/lib/ai-config is the thin cached DB wrapper over it.
//
// Note it reads each field's OWN env var rather than reusing env.ts's collapsed
// cascade: keeping VISION_API_KEY distinct from EMBEDDING_API_KEY is what lets
// the settings UI say whether a value is set here, inherited, or absent.

export const AI_FIELD_KEYS = [
  "deepseekApiKey",
  "deepseekBaseUrl",
  "deepseekModelFast",
  "deepseekModelReasoner",
  "embeddingApiKey",
  "embeddingBaseUrl",
  "embeddingModel",
  "visionApiKey",
  "visionBaseUrl",
  "visionModel",
] as const;

export type AiFieldKey = (typeof AI_FIELD_KEYS)[number];

/** Grouping for the settings UI; also the display order. */
export const AI_FIELD_GROUPS = [
  {
    group: "deepseek",
    keys: [
      "deepseekApiKey",
      "deepseekBaseUrl",
      "deepseekModelFast",
      "deepseekModelReasoner",
    ],
  },
  { group: "embedding", keys: ["embeddingApiKey", "embeddingBaseUrl", "embeddingModel"] },
  { group: "vision", keys: ["visionApiKey", "visionBaseUrl", "visionModel"] },
] as const satisfies readonly { group: string; keys: readonly AiFieldKey[] }[];

export type AiGroup = (typeof AI_FIELD_GROUPS)[number]["group"];

const SECRET_KEYS: readonly AiFieldKey[] = [
  "deepseekApiKey",
  "embeddingApiKey",
  "visionApiKey",
];

/** Secret fields are masked in every response and never sent to the browser. */
export function isSecretField(k: AiFieldKey): boolean {
  return SECRET_KEYS.includes(k);
}

/** Used when neither the DB nor env supplies a value. Empty = "not configured". */
export const AI_DEFAULTS: Record<AiFieldKey, string> = {
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModelFast: "deepseek-v4-flash",
  deepseekModelReasoner: "deepseek-v4-pro",
  embeddingApiKey: "",
  embeddingBaseUrl: "https://api.openai.com/v1",
  embeddingModel: "text-embedding-3-small",
  visionApiKey: "",
  // Empty so the cascade below can fall through to the resolved embeddings URL.
  visionBaseUrl: "",
  visionModel: "gpt-4o-mini",
};

export type AiDbValues = Partial<Record<AiFieldKey, string>>;
export type AiEnvRaw = Partial<Record<AiFieldKey, string>> & {
  openaiApiKey?: string;
};

export type AiConfig = Record<AiFieldKey, string> & {
  isAiConfigured: boolean;
  isEmbeddingsConfigured: boolean;
  isVisionConfigured: boolean;
};

/** Where a field's value came from — drives the settings badge. */
export type AiSource = "db" | "env" | "inherited" | "unset";

const clean = (v: string | undefined | null): string => (v ?? "").trim();

/** Each field's OWN env var. Cascades are applied in resolveAiConfig so that a
 *  DB value can participate in them. */
export function readAiEnv(e: NodeJS.ProcessEnv = process.env): AiEnvRaw {
  return {
    deepseekApiKey: e.DEEPSEEK_API_KEY,
    deepseekBaseUrl: e.DEEPSEEK_BASE_URL,
    deepseekModelFast: e.DEEPSEEK_MODEL_FAST,
    deepseekModelReasoner: e.DEEPSEEK_MODEL_REASONER,
    embeddingApiKey: e.EMBEDDING_API_KEY,
    embeddingBaseUrl: e.EMBEDDING_BASE_URL,
    embeddingModel: e.EMBEDDING_MODEL,
    visionApiKey: e.VISION_API_KEY,
    visionBaseUrl: e.VISION_BASE_URL,
    visionModel: e.VISION_MODEL,
    openaiApiKey: e.OPENAI_API_KEY,
  };
}

/** A field's own value: DB → its own env var → default. No cascade. */
function own(db: AiDbValues, raw: AiEnvRaw, k: AiFieldKey): string {
  return clean(db[k]) || clean(raw[k]) || AI_DEFAULTS[k];
}

/**
 * The effective config. The cascades run on RESOLVED values, not raw env: a
 * vision key left blank inherits whatever embeddings actually ended up using,
 * including a value set in the admin UI.
 */
export function resolveAiConfig(db: AiDbValues, raw: AiEnvRaw): AiConfig {
  const v = (k: AiFieldKey) => own(db, raw, k);

  const deepseekApiKey = v("deepseekApiKey");
  const embeddingApiKey = v("embeddingApiKey") || clean(raw.openaiApiKey);
  const embeddingBaseUrl = v("embeddingBaseUrl");
  const visionApiKey = v("visionApiKey") || embeddingApiKey;
  const visionBaseUrl = v("visionBaseUrl") || embeddingBaseUrl;

  return {
    deepseekApiKey,
    deepseekBaseUrl: v("deepseekBaseUrl"),
    deepseekModelFast: v("deepseekModelFast"),
    deepseekModelReasoner: v("deepseekModelReasoner"),
    embeddingApiKey,
    embeddingBaseUrl,
    embeddingModel: v("embeddingModel"),
    visionApiKey,
    visionBaseUrl,
    visionModel: v("visionModel"),
    isAiConfigured: Boolean(deepseekApiKey),
    isEmbeddingsConfigured: Boolean(embeddingApiKey),
    isVisionConfigured: Boolean(visionApiKey),
  };
}

/** Per-field provenance for the settings UI. "inherited" means the field itself
 *  is blank but a cascade supplies a working value. */
export function resolveAiSources(
  db: AiDbValues,
  raw: AiEnvRaw,
): Record<AiFieldKey, AiSource> {
  const out = Object.fromEntries(
    AI_FIELD_KEYS.map((k): [AiFieldKey, AiSource] => [
      k,
      clean(db[k]) ? "db" : clean(raw[k]) ? "env" : "unset",
    ]),
  ) as Record<AiFieldKey, AiSource>;

  // "inherited" = this field is blank but a cascade supplies a value. Test the
  // cascade SOURCE, not the resolved value: embeddingBaseUrl always resolves
  // (it has a built-in default), so checking cfg.visionBaseUrl would mark
  // vision "inherited" even with nothing configured anywhere.
  const has = (k: AiFieldKey) => Boolean(clean(db[k]) || clean(raw[k]));
  if (out.embeddingApiKey === "unset" && clean(raw.openaiApiKey)) out.embeddingApiKey = "inherited";
  if (out.visionApiKey === "unset" && (has("embeddingApiKey") || clean(raw.openaiApiKey))) out.visionApiKey = "inherited";
  if (out.visionBaseUrl === "unset" && has("embeddingBaseUrl")) out.visionBaseUrl = "inherited";
  return out;
}

/** A hint that identifies a stored secret without revealing it: the last four
 *  characters only. Anything shorter reveals nothing at all. */
export function maskSecret(v: string | null | undefined): string {
  const s = v?.trim() ?? "";
  if (!s) return "";
  return s.length <= 4 ? "…" : `…${s.slice(-4)}`;
}
