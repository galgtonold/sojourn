// supabase/functions/_shared/config.ts is Deno code: it lives outside the
// Next.js tsc project and no test imports/executes it, so nothing catches a
// rename in src/lib/ai-config-fields.ts (AI_FIELD_KEYS / AI_DEFAULTS) that
// silently recreates the split-brain bug this module exists to fix (the edge
// functions would keep reading old key names from app_secrets forever). This
// mirrors test/unit/app-secrets-migration.test.ts: read the non-TS file as
// TEXT and assert on its literal contents. Values are imported from the real
// source, not hardcoded, so a rename fails THIS test loudly instead of
// diverging silently.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_DEFAULTS, readAiEnv } from "@/lib/ai-config-fields";

// field key -> the env var name readAiEnv actually reads for it. Recovered by
// running the real function over a Proxy that echoes each property it touches,
// so the names come from the source rather than a hardcoded copy that could
// drift past a rename — the exact failure this file exists to catch.
const ENV_NAMES = readAiEnv(
  new Proxy({}, { get: (_t, prop) => String(prop) }) as NodeJS.ProcessEnv,
) as Record<string, string>;

const CONFIG_PATH = join(
  process.cwd(),
  "supabase/functions/_shared/config.ts",
);

describe("edge config parity with src/lib/ai-config-fields.ts", () => {
  const src = readFileSync(CONFIG_PATH, "utf8");

  it.each([
    "deepseekApiKey",
    "deepseekBaseUrl",
    "deepseekModelFast",
  ] as const)("references app_secrets key %s", (key) => {
    expect(src).toContain(`"${key}"`);
  });

  // Anchored on the edge's `const X = "…"` declaration, not a bare substring:
  // toContain(AI_DEFAULTS.deepseekModelFast) passes whenever the app default is
  // a PREFIX of the edge's value, so shortening it to "deepseek-v4" would
  // false-pass against an edge still pinned to "deepseek-v4-flash".
  it.each([
    ["DEFAULT_BASE_URL", AI_DEFAULTS.deepseekBaseUrl],
    ["DEFAULT_FAST_MODEL", AI_DEFAULTS.deepseekModelFast],
  ])("declares %s as exactly the matching AI_DEFAULTS value", (name, value) => {
    expect(src).toContain(`const ${name} = "${value}";`);
  });

  // The other half of the contract: the two sides must read the same env vars.
  // A rename in readAiEnv() with the edge left behind means an operator's env
  // reaches the app but not llm-call/translate — the same split brain, sourced
  // from env instead of app_secrets.
  it.each([
    "deepseekApiKey",
    "deepseekBaseUrl",
    "deepseekModelFast",
  ] as const)("reads the same env var as readAiEnv does for %s", (key) => {
    expect(src).toContain(`env("${ENV_NAMES[key]}")`);
  });
});
