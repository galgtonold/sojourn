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

// ── the all-in-one stack ─────────────────────────────────────────────────────
//
// Sojourn plus the five Supabase services it actually needs, for people who
// want a blog rather than a Supabase account. Everything below is something
// that broke while building it and cost a full teardown to find.
const ALL_IN_ONE = readFileSync("docker-compose.all-in-one.yml", "utf8");
const KONG = readFileSync("docker/kong.yml", "utf8");

describe("the all-in-one stack", () => {
  it("hands the app every name it needs to reach Supabase", () => {
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "SITE_URL",
      "SOURCE_URL",
    ]) {
      expect(ALL_IN_ONE, `web service never sets ${name}`).toMatch(
        new RegExp(`^\\s*${name}:`, "m"),
      );
    }
  });

  it("waits for storage to be HEALTHY before starting the app", () => {
    // storage-api creates the `storage` schema by running its own migrations on
    // first boot, and Sojourn's 0001_init writes policies on storage.objects.
    // Start on `service_started` instead and the very first migration dies with
    // `42P01: relation "storage.buckets" does not exist` — which reads like a
    // broken migration rather than a race.
    expect(ALL_IN_ONE).toMatch(/storage:\s*\n\s*condition:\s*service_healthy/);
  });

  it("healthchecks storage over IPv4, not `localhost`", () => {
    // storage-api binds IPv4 only, and `localhost` resolves to ::1 first inside
    // that image. The check is refused while the service is perfectly healthy,
    // so nothing depending on it ever starts.
    expect(ALL_IN_ONE).toContain("http://127.0.0.1:5000/status");
    expect(ALL_IN_ONE).not.toContain("http://localhost:5000/status");
  });

  it("sets the service role passwords after the image creates the roles", () => {
    // The supabase/postgres image creates these roles but leaves them with a
    // password this instance does not know, so GoTrue and storage-api fail with
    // 28P01. The fix has to sort AFTER the image's own migrate.sh, or it fails
    // with `role "authenticator" does not exist` instead.
    expect(ALL_IN_ONE).toMatch(/init-roles\.sh:\/docker-entrypoint-initdb\.d\/zz-/);
  });

  it("keeps Kong's format version a string", () => {
    // The entrypoint substitutes the keys with `eval "echo \"$(cat ...)\""`,
    // which eats double quotes — Kong then reads 2.1 as a number and refuses to
    // start. Single quotes survive.
    expect(KONG).toMatch(/_format_version:\s*'2\.1'/);
    expect(KONG).not.toMatch(/_format_version:\s*"2\.1"/);
  });

  it("locks the data API behind a key, and leaves auth open", () => {
    // Signing in cannot require a key you only get by signing in.
    expect(KONG).toMatch(/name: rest-v1[\s\S]*?name: key-auth/);
    expect(KONG).not.toMatch(/name: auth-v1[\s\S]*?key-auth[\s\S]*?name: rest-v1/);
  });

  it("names volumes for the two things that are not replaceable", () => {
    // The database and the photographs. Everything else in this stack can be
    // pulled again.
    expect(ALL_IN_ONE).toMatch(/db-data:\/var\/lib\/postgresql\/data/);
    expect(ALL_IN_ONE).toMatch(/storage-data:\/var\/lib\/storage/);
  });

  it("pins every image, so a fresh install gets what was tested", () => {
    const images = [...ALL_IN_ONE.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
    expect(images.length).toBeGreaterThan(4);
    const floating = images.filter(
      (i) => !i.includes(":") || i.endsWith(":latest") || i.includes("${SOJOURN_TAG"),
    );
    // Sojourn's own image is the one exception — a self-hoster upgrades the app
    // deliberately, and SOJOURN_TAG is how.
    expect(floating.every((i) => i.includes("sojourn"))).toBe(true);
  });
});
