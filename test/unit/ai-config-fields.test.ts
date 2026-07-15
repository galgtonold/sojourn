import { describe, it, expect } from "vitest";
import {
  AI_DEFAULTS,
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

  it("marks a cascade-supplied value as inherited", () => {
    const s = resolveAiSources({ embeddingApiKey: "sk-e" }, {});
    expect(s.visionApiKey).toBe("inherited");
    expect(s.visionBaseUrl).toBe("inherited");
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
});
