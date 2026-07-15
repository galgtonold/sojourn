import { describe, it, expect, vi } from "vitest";
import {
  AI_DEFAULTS,
  AI_FIELD_GROUPS,
  AI_FIELD_KEYS,
  isSecretField,
  maskSecret,
  readAiEnv,
  resolveAiConfig,
  resolveAiSources,
} from "@/lib/ai-config-fields";

describe("resolveAiConfig precedence", () => {
  it("prefers the DB value over env and default", () => {
    const cfg = resolveAiConfig(
      { deepseekBaseUrl: "https://db.example" },
      { deepseekBaseUrl: "https://env.example" },
    );
    expect(cfg.deepseekBaseUrl).toBe("https://db.example");
  });

  it("falls back to env when the DB has no value", () => {
    const cfg = resolveAiConfig({}, { deepseekBaseUrl: "https://env.example" });
    expect(cfg.deepseekBaseUrl).toBe("https://env.example");
  });

  it("falls back to the default when neither has a value", () => {
    expect(resolveAiConfig({}, {}).deepseekBaseUrl).toBe("https://api.deepseek.com");
    expect(resolveAiConfig({}, {}).deepseekModelFast).toBe("deepseek-v4-flash");
    expect(resolveAiConfig({}, {}).deepseekModelReasoner).toBe("deepseek-v4-pro");
    expect(resolveAiConfig({}, {}).deepseekModelVision).toBe("deepseek-v4-flash");
    expect(resolveAiConfig({}, {}).embeddingModel).toBe("text-embedding-3-small");
    expect(resolveAiConfig({}, {}).visionModel).toBe("gpt-4o-mini");
  });

  it("treats a blank or whitespace DB value as absent", () => {
    const cfg = resolveAiConfig(
      { deepseekBaseUrl: "   " },
      { deepseekBaseUrl: "https://env.example" },
    );
    expect(cfg.deepseekBaseUrl).toBe("https://env.example");
  });

  it("trims values", () => {
    expect(resolveAiConfig({ deepseekApiKey: "  sk-x  " }, {}).deepseekApiKey).toBe("sk-x");
  });
});

describe("resolveAiConfig cascades", () => {
  it("embeddings key falls back to OPENAI_API_KEY", () => {
    expect(resolveAiConfig({}, { openaiApiKey: "sk-openai" }).embeddingApiKey).toBe("sk-openai");
  });

  it("vision key falls back to the RESOLVED embeddings key, so a DB embeddings key wins over env OPENAI", () => {
    const cfg = resolveAiConfig(
      { embeddingApiKey: "sk-db-embed" },
      { openaiApiKey: "sk-env-openai" },
    );
    expect(cfg.visionApiKey).toBe("sk-db-embed");
  });

  it("an own vision key beats the embeddings cascade", () => {
    const cfg = resolveAiConfig({ visionApiKey: "sk-vision" }, { embeddingApiKey: "sk-embed" });
    expect(cfg.visionApiKey).toBe("sk-vision");
  });

  it("vision base URL falls back to the resolved embeddings base URL", () => {
    const cfg = resolveAiConfig({ embeddingBaseUrl: "https://ollama.local/v1" }, {});
    expect(cfg.visionBaseUrl).toBe("https://ollama.local/v1");
  });

  it("vision base URL falls back to an env-supplied embeddings base URL too — the cascade isn't DB-only", () => {
    const cfg = resolveAiConfig({}, { embeddingBaseUrl: "x" });
    expect(cfg.visionBaseUrl).toBe("x");
  });

  it("an env VISION_API_KEY beats an env EMBEDDING_API_KEY — the cascade isn't DB-only", () => {
    const cfg = resolveAiConfig({}, { visionApiKey: "sk-vision-env", embeddingApiKey: "sk-embed-env" });
    expect(cfg.visionApiKey).toBe("sk-vision-env");
  });
});

describe("capability flags", () => {
  it("isAiConfigured tracks the resolved deepseek key only", () => {
    expect(resolveAiConfig({}, {}).isAiConfigured).toBe(false);
    expect(resolveAiConfig({ deepseekApiKey: "k" }, {}).isAiConfigured).toBe(true);
    expect(resolveAiConfig({}, { deepseekApiKey: "k" }).isAiConfigured).toBe(true);
    // An embeddings key must not switch drafting on.
    expect(resolveAiConfig({ embeddingApiKey: "k" }, {}).isAiConfigured).toBe(false);
  });

  it("isEmbeddingsConfigured and isVisionConfigured track their resolved keys", () => {
    expect(resolveAiConfig({}, {}).isEmbeddingsConfigured).toBe(false);
    expect(resolveAiConfig({}, {}).isVisionConfigured).toBe(false);
    // One OPENAI_API_KEY lights up both, via the cascade.
    const cfg = resolveAiConfig({}, { openaiApiKey: "sk-o" });
    expect(cfg.isEmbeddingsConfigured).toBe(true);
    expect(cfg.isVisionConfigured).toBe(true);
  });
});

describe("resolveAiSources", () => {
  it("reports db / env / unset per field", () => {
    const s = resolveAiSources(
      { deepseekApiKey: "k" },
      { deepseekBaseUrl: "https://env.example" },
    );
    expect(s.deepseekApiKey).toBe("db");
    expect(s.deepseekBaseUrl).toBe("env");
    expect(s.deepseekModelFast).toBe("unset");
  });

  it("db wins the badge even when env also has the field", () => {
    const s = resolveAiSources({ deepseekApiKey: "db" }, { deepseekApiKey: "env" });
    expect(s.deepseekApiKey).toBe("db");
  });

  it("marks a cascade-supplied api key as inherited", () => {
    const s = resolveAiSources({ embeddingApiKey: "sk-e" }, {});
    expect(s.visionApiKey).toBe("inherited");
  });

  it("marks a cascade-supplied base URL as inherited", () => {
    const s = resolveAiSources({ embeddingBaseUrl: "https://ollama.local/v1" }, {});
    expect(s.visionBaseUrl).toBe("inherited");
  });

  it("does not mark visionBaseUrl inherited when nothing is configured anywhere — embeddingBaseUrl's built-in default must not leak through as a false 'inherited'", () => {
    const s = resolveAiSources({}, {});
    expect(s.visionBaseUrl).toBe("unset");
  });

  it("does not mark a field inherited when it has its own value", () => {
    const s = resolveAiSources({ embeddingApiKey: "sk-e", visionApiKey: "sk-v" }, {});
    expect(s.visionApiKey).toBe("db");
  });
});

describe("maskSecret", () => {
  it("shows only the last four characters", () => {
    expect(maskSecret("sk-abcdef1234")).toBe("…1234");
  });

  it("never echoes a short secret", () => {
    expect(maskSecret("abcd")).toBe("…");
    expect(maskSecret("ab")).toBe("…");
  });

  it("returns empty for an empty value", () => {
    expect(maskSecret("")).toBe("");
    expect(maskSecret("   ")).toBe("");
  });
});

describe("registry", () => {
  it("has a default for every key", () => {
    for (const k of AI_FIELD_KEYS) expect(AI_DEFAULTS[k]).toBeTypeOf("string");
  });

  it("marks exactly the three api keys as secret", () => {
    expect(AI_FIELD_KEYS.filter(isSecretField)).toEqual([
      "deepseekApiKey",
      "embeddingApiKey",
      "visionApiKey",
    ]);
  });

  it("readAiEnv reads each field's OWN var, without collapsing cascades", () => {
    const raw = readAiEnv({
      DEEPSEEK_API_KEY: "sk-d",
      EMBEDDING_API_KEY: "sk-e",
      OPENAI_API_KEY: "sk-o",
    } as unknown as NodeJS.ProcessEnv);
    expect(raw.deepseekApiKey).toBe("sk-d");
    expect(raw.embeddingApiKey).toBe("sk-e");
    expect(raw.openaiApiKey).toBe("sk-o");
    // Not pre-resolved: the cascade is resolveAiConfig's job.
    expect(raw.visionApiKey).toBeUndefined();
  });

  it("readAiEnv maps all twelve env vars to their own field — a typo'd var name would silently revert prod to a default", () => {
    const raw = readAiEnv({
      DEEPSEEK_API_KEY: "v-deepseek-api-key",
      DEEPSEEK_BASE_URL: "v-deepseek-base-url",
      DEEPSEEK_MODEL_FAST: "v-deepseek-model-fast",
      DEEPSEEK_MODEL_REASONER: "v-deepseek-model-reasoner",
      DEEPSEEK_MODEL_VISION: "v-deepseek-model-vision",
      EMBEDDING_API_KEY: "v-embedding-api-key",
      EMBEDDING_BASE_URL: "v-embedding-base-url",
      EMBEDDING_MODEL: "v-embedding-model",
      VISION_API_KEY: "v-vision-api-key",
      VISION_BASE_URL: "v-vision-base-url",
      VISION_MODEL: "v-vision-model",
      OPENAI_API_KEY: "v-openai-api-key",
    } as unknown as NodeJS.ProcessEnv);

    expect(raw).toEqual({
      deepseekApiKey: "v-deepseek-api-key",
      deepseekBaseUrl: "v-deepseek-base-url",
      deepseekModelFast: "v-deepseek-model-fast",
      deepseekModelReasoner: "v-deepseek-model-reasoner",
      deepseekModelVision: "v-deepseek-model-vision",
      embeddingApiKey: "v-embedding-api-key",
      embeddingBaseUrl: "v-embedding-base-url",
      embeddingModel: "v-embedding-model",
      visionApiKey: "v-vision-api-key",
      visionBaseUrl: "v-vision-base-url",
      visionModel: "v-vision-model",
      openaiApiKey: "v-openai-api-key",
    });
  });

  it("AI_FIELD_GROUPS covers exactly AI_FIELD_KEYS — a key added to one but not the other would silently drop from the settings UI", () => {
    const grouped = AI_FIELD_GROUPS.flatMap((g) => g.keys).slice().sort();
    const all = [...AI_FIELD_KEYS].sort();
    expect(grouped).toEqual(all);
  });
});

describe("env-only parity with src/lib/env.ts", () => {
  // Nothing currently pins this value, yet it feeds both embeddingBaseUrl and
  // visionBaseUrl (via the cascade) on the live, env-only production site.
  it("AI_DEFAULTS.embeddingBaseUrl matches the live default", () => {
    expect(AI_DEFAULTS.embeddingBaseUrl).toBe("https://api.openai.com/v1");
  });

  it("resolveAiConfig({}, readAiEnv(env)) matches src/lib/env.ts field for field — the live site is env-only, so this parity must never break", async () => {
    const fixture = {
      DEEPSEEK_API_KEY: "sk-deepseek",
      DEEPSEEK_BASE_URL: "https://deepseek.example",
      DEEPSEEK_MODEL_FAST: "fixture-fast",
      DEEPSEEK_MODEL_REASONER: "fixture-reasoner",
      DEEPSEEK_MODEL_VISION: "fixture-vision",
      EMBEDDING_API_KEY: "sk-embed",
      EMBEDDING_BASE_URL: "https://embed.example",
      EMBEDDING_MODEL: "fixture-embed-model",
      VISION_API_KEY: "sk-vision",
      VISION_BASE_URL: "https://vision.example",
      VISION_MODEL: "fixture-vision-model",
      OPENAI_API_KEY: "sk-openai",
    };
    const keys = Object.keys(fixture) as (keyof typeof fixture)[];
    const prev: Record<string, string | undefined> = {};
    for (const k of keys) prev[k] = process.env[k];

    try {
      for (const k of keys) process.env[k] = fixture[k];
      vi.resetModules();
      const live = await import("@/lib/env");

      const cfg = resolveAiConfig({}, readAiEnv(fixture as unknown as NodeJS.ProcessEnv));

      expect(cfg.deepseekApiKey).toBe(live.env.deepseekApiKey);
      expect(cfg.deepseekBaseUrl).toBe(live.env.deepseekBaseUrl);
      expect(cfg.deepseekModelFast).toBe(live.env.deepseekModelFast);
      expect(cfg.deepseekModelReasoner).toBe(live.env.deepseekModelReasoner);
      expect(cfg.deepseekModelVision).toBe(live.env.deepseekModelVision);
      expect(cfg.embeddingApiKey).toBe(live.env.embeddingApiKey);
      expect(cfg.embeddingBaseUrl).toBe(live.env.embeddingBaseUrl);
      expect(cfg.embeddingModel).toBe(live.env.embeddingModel);
      expect(cfg.visionApiKey).toBe(live.env.visionApiKey);
      expect(cfg.visionBaseUrl).toBe(live.env.visionBaseUrl);
      expect(cfg.visionModel).toBe(live.env.visionModel);
      expect(cfg.isAiConfigured).toBe(live.isAiConfigured);
      expect(cfg.isEmbeddingsConfigured).toBe(live.isEmbeddingsConfigured);
      expect(cfg.isVisionConfigured).toBe(live.isVisionConfigured);
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
      vi.resetModules();
    }
  });
});
