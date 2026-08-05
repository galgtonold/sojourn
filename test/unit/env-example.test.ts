import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// `.env.example` is the file an operator copies and then edits. Anything the
// code reads that is missing from it has to be learned from source — which for
// `EDGE_SHARED_SECRET` meant the one thing standing between a stranger and
// arbitrary revalidatePath calls was undocumented in the place that configures
// the product, while the README described it in the place that describes it.
//
// Same guard as docker-compose has in compose-config.test.ts, and for the same
// reason: a config surface that nothing checks drifts silently, and the drift
// only shows up as somebody else's confusing afternoon.

const EXAMPLE = readFileSync(".env.example", "utf8");
const ENV = readFileSync("src/lib/env.ts", "utf8");
const PUBLIC_CONFIG = readFileSync("src/lib/public-config.ts", "utf8");

/** Names mentioned in .env.example, set or commented out. */
function documented(): Set<string> {
  const out = new Set<string>();
  for (const m of EXAMPLE.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) out.add(m[1]);
  return out;
}

describe(".env.example covers what the app reads", () => {
  it("parses some names out of the file at all", () => {
    // Guard the guard: an empty set would make every assertion below pass.
    const names = documented();
    expect(names.size).toBeGreaterThan(15);
    expect(names).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("documents the secret that gates the Edge Function path", () => {
    expect(documented()).toContain("EDGE_SHARED_SECRET");
  });

  it("documents the unprefixed spellings a container host needs", () => {
    // publicConfigFromEnv prefers these, and docker-compose passes only these.
    // An operator copying the example got the Vercel-shaped half only.
    const names = documented();
    for (const n of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SITE_URL",
      "SITE_NAME",
      "MAP_STYLE_URL",
      "VAPID_PUBLIC_KEY",
      "DEMO_MODE",
    ]) {
      expect(documented(), `${n} is read by public-config but absent from .env.example`).toContain(n);
      expect(names).toContain(n);
    }
  });

  it("documents the service-key alias env.ts actually accepts", () => {
    // Checked against the source rather than taken on trust: the alias is
    // SUPABASE_SECRET_KEY. The all-in-one stack's SUPABASE_SERVICE_KEY is a
    // COMPOSE variable, mapped to the ROLE name in docker-compose — the app
    // never reads that spelling.
    expect(ENV).toMatch(/SUPABASE_SECRET_KEY/);
    expect(documented()).toContain("SUPABASE_SECRET_KEY");
  });

  it("documents telemetry, which is off unless it is turned on", () => {
    const names = documented();
    expect(names).toContain("ANALYTICS");
    expect(names).toContain("SENTRY_DSN");
  });

  it("documents SOURCE_URL, which a modified deployment must set", () => {
    // AGPL §13. compose already asserts it is passed through; this asserts an
    // operator is told it exists.
    expect(documented()).toContain("SOURCE_URL");
  });

  it("still references public-config, so this test is aimed at the right file", () => {
    expect(PUBLIC_CONFIG).toMatch(/SUPABASE_URL/);
  });
});
