import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// docker-compose.yml enumerates the environment it passes through, one variable
// at a time. That is the right call — it documents what a container actually
// reads — but it means a config field can be added to the app, documented in
// .env.example, and still be unreachable for anyone deploying with compose.
//
// Which is exactly what happened to SOURCE_URL: the app read it, the README
// told people to set it, and the container never saw it. Nothing failed; the
// footer just kept pointing at upstream, which for a modified deployment is an
// AGPL §13 problem rather than a cosmetic one. Caught by standing a fresh
// instance up and looking, not by any test — hence this one.

const COMPOSE = readFileSync("docker-compose.yml", "utf8");
const CONFIG = readFileSync("src/lib/public-config.ts", "utf8");

// Names the platform supplies, not the operator — nothing to pass through.
const PROVIDED_BY_HOST = new Set(["VERCEL_PROJECT_PRODUCTION_URL"]);

/** Every unprefixed env name publicConfigFromEnv reads. */
function runtimeSettableNames(): string[] {
  const names = new Set<string>();
  for (const m of CONFIG.matchAll(/\be\.([A-Z][A-Z0-9_]*)/g)) {
    const name = m[1];
    if (name.startsWith("NEXT_PUBLIC_") || PROVIDED_BY_HOST.has(name)) continue;
    names.add(name);
  }
  return [...names].sort();
}

describe("docker-compose passes through what the app reads", () => {
  it("finds the config names to check", () => {
    // Guard the guard: a regex that matched nothing would make every assertion
    // below pass while testing nothing at all.
    const names = runtimeSettableNames();
    expect(names.length).toBeGreaterThan(4);
    expect(names).toContain("SUPABASE_URL");
  });

  it("passes every runtime-settable public config variable", () => {
    const missing = runtimeSettableNames().filter(
      (n) => !new RegExp(`^\\s*${n}:\\s*\\$\\{${n}:-`, "m").test(COMPOSE),
    );
    expect(
      missing,
      `docker-compose.yml never passes these, so a compose deployment cannot set them: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("passes SOURCE_URL, which a modified deployment is obliged to set", () => {
    // Called out on its own because this one is a licence obligation, not a
    // preference: AGPL §13 requires offering the source of the running version.
    expect(COMPOSE).toMatch(/^\s*SOURCE_URL:\s*\$\{SOURCE_URL:-\}/m);
  });

  it("still passes DATABASE_URL, which the migration runner needs at boot", () => {
    // Not part of public config — it never reaches the browser — so the sweep
    // above cannot see it, and dropping it would silently stop migrations.
    expect(COMPOSE).toMatch(/^\s*DATABASE_URL:\s*\$\{DATABASE_URL:-\}/m);
  });
});
