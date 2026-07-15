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
import { AI_DEFAULTS } from "@/lib/ai-config-fields";

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

  it("defaults its base URL to the same value as AI_DEFAULTS.deepseekBaseUrl", () => {
    expect(src).toContain(AI_DEFAULTS.deepseekBaseUrl);
  });

  it("defaults its fast model to the same value as AI_DEFAULTS.deepseekModelFast", () => {
    expect(src).toContain(AI_DEFAULTS.deepseekModelFast);
  });
});
