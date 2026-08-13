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

/**
 * Pull one `configs:` entry's inline `content:` block back out, dedented.
 *
 * Kong's routing table and the Postgres role fix used to be files under
 * ./docker/ that the stack bind-mounted. They live in the compose file itself
 * now, so that ONE file is a working install and self-hosting no longer starts
 * with cloning a repository whose source you never need. These assertions are
 * the same ones; only where they read from changed.
 */
function inlineConfig(name: string): string {
  const head = `  ${name}:\n    content: |\n`;
  const at = ALL_IN_ONE.indexOf(head);
  if (at === -1) return "";
  const out: string[] = [];
  for (const line of ALL_IN_ONE.slice(at + head.length).split("\n")) {
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    if (!line.startsWith("      ")) break;
    out.push(line.slice(6));
  }
  return out.join("\n");
}

const KONG = inlineConfig("kong-config");
const DB_INIT = inlineConfig("db-init-roles");

describe("the all-in-one stack", () => {
  it("found both inline configs", () => {
    // Guard the guard: if inlineConfig stopped matching — a rename, a change of
    // indentation — every KONG assertion below would pass against an empty
    // string and this file would silently stop testing anything.
    expect(KONG).toContain("_format_version");
    expect(KONG).toContain("name: rest-v1");
    expect(DB_INIT).toContain("alter user authenticator");
  });

  it("mounts nothing from a checkout, so the one file is the whole install", () => {
    // The point of the configs: `docker compose -f <url> up -d` has to work,
    // and a bind mount of ./docker/kong.yml makes that a broken stack instead
    // of an install. Named volumes are fine — they are created, not read from
    // the host — so only relative host paths are rejected here.
    const hostMounts = [...ALL_IN_ONE.matchAll(/^\s*-\s+(\.[^\s:]*):/gm)].map(
      (m) => m[1],
    );
    expect(
      hostMounts,
      `these are read from the filesystem next to the compose file, so fetching it alone yields a stack that cannot start: ${hostMounts.join(", ")}`,
    ).toEqual([]);
  });

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
    // with `role "authenticator" does not exist` instead — hence the zz- prefix.
    expect(ALL_IN_ONE).toMatch(
      /target:\s*\/docker-entrypoint-initdb\.d\/zz-sojourn-roles\.sh/,
    );
  });

  it("leaves the role script's own variables for the shell, not Compose", () => {
    // `$$` is how a literal dollar survives Compose's interpolation. Written
    // with one, Compose would substitute POSTGRES_USER from the env file at
    // render time — which is empty there, since the Postgres image is what sets
    // it — and the script would run `psql --username ""`.
    expect(DB_INIT).toContain('--username "$$POSTGRES_USER"');
    expect(DB_INIT).toMatch(/password '\$\$POSTGRES_PASSWORD'/);
  });

  it("keeps Kong's format version a string", () => {
    // Unquoted, YAML reads 2.1 as a number and Kong refuses to start with
    // "expected a string".
    expect(KONG).toMatch(/_format_version:\s*'2\.1'/);
    expect(KONG).not.toMatch(/_format_version:\s*"2\.1"/);
  });

  it("lets Compose substitute the API keys, and fails loudly if they are unset", () => {
    // One dollar, deliberately: these SHOULD be interpolated as the file is
    // read. `:?` turns a missing key into a refusal to start rather than a Kong
    // whose credentials are the empty string — which would accept any request.
    expect(KONG).toMatch(/- key: \$\{SUPABASE_ANON_KEY:\?/);
    expect(KONG).toMatch(/- key: \$\{SUPABASE_SERVICE_KEY:\?/);
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

describe("the one route that cannot require a key is throttled", () => {
  // /auth/v1/ has no key-auth by definition — you have no key until you have
  // signed in — and GoTrue v2.190.0 ships no rate limit for the password grant
  // (it has them for refresh, OTP, verify, email and SMS, and checking that is
  // how this got written). So password guessing is free unless Kong stops it.
  it("attaches rate-limiting to the auth route", () => {
    const authBlock = /- name: auth-v1[\s\S]*?(?=\n  - name: |\n*$)/.exec(KONG)?.[0] ?? "";
    expect(authBlock).toContain("name: rate-limiting");
    expect(authBlock).toMatch(/limit_by: ip/);
  });

  it("enables the plugin on the node, or the config is ignored", () => {
    // Kong silently drops plugins missing from KONG_PLUGINS, so a config that
    // looks throttled would not be.
    expect(ALL_IN_ONE).toMatch(/KONG_PLUGINS:[^\n]*rate-limiting/);
  });

  it("counts locally, which is right for exactly one Kong", () => {
    expect(KONG).toMatch(/policy: local/);
  });

  it("refuses rather than passes through when the counter breaks", () => {
    expect(KONG).toMatch(/fault_tolerant: false/);
  });

  it("does not put key-auth on the auth route", () => {
    // Requiring a key to sign in would lock everyone out permanently.
    const authBlock = /- name: auth-v1[\s\S]*?(?=\n  - name: |\n*$)/.exec(KONG)?.[0] ?? "";
    expect(authBlock).not.toContain("name: key-auth");
  });
});
