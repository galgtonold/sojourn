// Bring a throwaway Sojourn stack up and down for the browser suite.
//
//   node scripts/e2e-stack.mjs up     [--tag <image-tag>]
//   node scripts/e2e-stack.mjs down
//   node scripts/e2e-stack.mjs env    # print the base URL, for scripting
//
// Used by `npm run test:browser` and by the `e2e` job in CI, so a local failure
// and a CI failure are the same failure.
//
// ── Why a project name, always ──────────────────────────────────────────────
//
// docker-compose.all-in-one.yml sets `name: sojourn`. A compose project is
// identified by that name, NOT by the directory you run from — so running this
// file from a scratch directory without `-p` does not create a second stack, it
// reaches into the one already running and recreates its containers. That has
// already happened once on this project, to a live stack. Everything below goes
// through `-p ${PROJECT}`.
//
// ── Why non-default ports ───────────────────────────────────────────────────
//
// 3000 and 8000 are what a real install uses, and a developer running this on
// their own machine very likely has one. The stack here publishes 3801/8801.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIR = path.join(ROOT, ".e2e");
const ENV_FILE = path.join(DIR, ".env");

const PROJECT = process.env.E2E_COMPOSE_PROJECT ?? "sojourn-e2e";
const APP_PORT = process.env.E2E_APP_PORT ?? "3801";
const API_PORT = process.env.E2E_API_PORT ?? "8801";
const BASE_URL = `http://localhost:${APP_PORT}`;

/** `up` exits with this when the registry refused to serve the images. */
export const EXIT_REGISTRY_THROTTLED = 75;

// Extra `-f` overlays, comma-separated. CI passes docker-compose.ci.yml, which
// repoints the Supabase images at a private GHCR mirror — a local run pulls
// from upstream like everyone else, and should, since that is the path a reader
// following the README takes.
const OVERLAYS = (process.env.E2E_COMPOSE_OVERLAYS ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

const COMPOSE = [
  "compose",
  "-p",
  PROJECT,
  "-f",
  path.join(ROOT, "docker-compose.all-in-one.yml"),
  ...OVERLAYS.flatMap((f) => ["-f", path.resolve(ROOT, f)]),
  "--env-file",
  ENV_FILE,
];

const run = (args, opts = {}) =>
  execFileSync("docker", args, { stdio: "inherit", cwd: ROOT, ...opts });

function writeEnv(tag) {
  mkdirSync(DIR, { recursive: true });
  // The installer generates the secrets; we only retarget the ports, so this
  // exercises the same generator a real install runs.
  const generated = execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts", "selfhost-init.mjs"), "--stdout"],
    { encoding: "utf8", cwd: ROOT },
  );

  const overrides = {
    SOJOURN_PORT: APP_PORT,
    SUPABASE_PORT: API_PORT,
    SITE_URL: BASE_URL,
    // host.docker.internal, NOT localhost — this one value is handed to both the
    // visitor's browser and the app container, and they do not agree on what
    // "localhost" means. Pointing it at localhost makes the container resolve
    // its OWN loopback, where nothing is listening: every server-side Supabase
    // call is refused, `hasOwner` cannot answer, setup state degrades to
    // "unknown", and the middleware fails open and serves the site. A fresh
    // install then looks configured, with nothing in any log to say otherwise.
    // The installer defaults to this name for the same reason.
    SUPABASE_PUBLIC_URL: `http://host.docker.internal:${API_PORT}`,
    SOJOURN_TAG: tag,
  };

  const lines = generated
    .split("\n")
    .filter((l) => !Object.keys(overrides).some((k) => l.startsWith(`${k}=`)));
  for (const [k, v] of Object.entries(overrides)) lines.push(`${k}=${v}`);

  writeFileSync(ENV_FILE, `${lines.join("\n").trim()}\n`, "utf8");
  console.log(`wrote ${path.relative(ROOT, ENV_FILE)} (ports ${APP_PORT}/${API_PORT}, tag ${tag})`);
}

/**
 * Pull the Supabase images before `up`, retrying the rate limit.
 *
 * They come from public.ecr.aws, which throttles anonymous pulls per source IP
 * — and a GitHub runner shares its IP with every other runner in that range, so
 * `toomanyrequests: Rate exceeded` arrives with no warning and no relation to
 * anything in the change being tested. `up --wait` reports it as a failed stack
 * start, which reads like a broken compose file.
 *
 * Separated from `up` so the retry can be about the pull alone: a genuine
 * compose error still fails immediately rather than being retried four times.
 */
async function pullWithRetry(attempts = 4) {
  // Named services, not everything: `web` is built locally and tagged into the
  // daemon, so it exists in no registry and pulling it fails every time.
  const upstream = ["db", "auth", "rest", "storage", "kong"];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = spawnSync("docker", [...COMPOSE, "pull", "--quiet", ...upstream], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (res.status === 0) return;

    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    const throttled = /toomanyrequests|rate exceeded|too many requests/i.test(output);
    if (!throttled) {
      process.stderr.write(output);
      throw new Error("docker compose pull failed for a reason other than rate limiting");
    }
    if (attempt === attempts) {
      process.stderr.write(output);
      console.error(
        `\npublic.ecr.aws throttled every one of ${attempts} pull attempts.\n` +
          `Nothing about the change under test caused this: the registry limits\n` +
          `anonymous pulls per source IP, and a CI runner shares its IP with\n` +
          `every other runner in that range.\n`,
      );
      // A distinct code so a caller can tell "the registry would not serve us"
      // from "the stack is broken" — the second must fail a build and the first
      // must not, or the suite gets muted for something it did not do.
      process.exit(EXIT_REGISTRY_THROTTLED);
    }
    const wait = attempt * 15;
    console.log(`registry throttled (attempt ${attempt}/${attempts}); waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

function dumpDiagnostics() {
  spawnSync("docker", [...COMPOSE, "ps"], { stdio: "inherit", cwd: ROOT });
  spawnSync("docker", [...COMPOSE, "logs", "--tail", "80", "web"], {
    stdio: "inherit",
    cwd: ROOT,
  });
}

async function waitForApp() {
  const deadline = Date.now() + 240_000;
  process.stdout.write("waiting for the app");
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL, { redirect: "manual" });
      if (res.status > 0) {
        console.log(`\napp is up at ${BASE_URL} (HTTP ${res.status})`);
        return;
      }
    } catch {
      /* not listening yet */
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log();
  dumpDiagnostics();
  throw new Error(`app did not answer on ${BASE_URL} within 240s`);
}

/**
 * Wait until GoTrue answers through the gateway, not merely until its container
 * reports healthy.
 *
 * Claiming the owner account is the first thing the suite does and the first
 * thing that touches auth, and a container that has passed its healthcheck can
 * still be slow enough on its first real request that the claim button sits on
 * "Wird angelegt…" past the test's timeout. That happened once here, on a
 * loaded machine, and produced a red run describing nothing.
 *
 * The suite retries nothing on purpose — a retried flake is an ignored flake —
 * so readiness has to be established before it starts rather than absorbed by
 * it afterwards.
 */
async function waitForAuth() {
  const url = `${supabaseUrl()}/auth/v1/health`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log("auth is answering through the gateway");
        return;
      }
    } catch {
      /* gateway not routing yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  dumpDiagnostics();
  throw new Error(`GoTrue did not answer on ${url} within 120s`);
}

/**
 * The stack answering is not the same as the stack working.
 *
 * `down -v` takes the volumes, so every `up` is a genuinely fresh install and
 * must funnel to /admin/setup. When it serves the site instead, the app could
 * not ask Supabase whether an owner exists — `getSetupState` returns "unknown"
 * and the middleware fails open by design, which is right for a database blip
 * and indistinguishable from a healthy install from the outside.
 *
 * That is a silent misconfiguration, and it is easy to cause: point
 * SUPABASE_PUBLIC_URL at localhost and the container resolves its own loopback.
 * Catch it here, where the message can say so, rather than in a spec that just
 * reports the wrong URL.
 */
async function assertFreshInstall() {
  const res = await fetch(BASE_URL, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  if (res.status >= 300 && res.status < 400 && location.includes("/admin/setup")) {
    console.log("fresh install confirmed: / redirects to /admin/setup");
    return;
  }

  const reach = await fetch(`${supabaseUrl()}/rest/v1/`, { redirect: "manual" })
    .then((r) => `HTTP ${r.status}`)
    .catch((e) => `unreachable (${e.cause?.code ?? e.message})`);

  dumpDiagnostics();
  throw new Error(
    [
      `A fresh stack served ${BASE_URL} with HTTP ${res.status} instead of`,
      `redirecting to /admin/setup.`,
      ``,
      `That means getSetupState() returned "unknown" — the app could not reach`,
      `Supabase to ask whether an owner exists, so the middleware failed open.`,
      `The site looks fine; nothing logs an error.`,
      ``,
      `SUPABASE_PUBLIC_URL is ${supabaseUrl()}, which from THIS host is ${reach}.`,
      `It has to resolve from inside the web container too — "localhost" there`,
      `is the container's own loopback, which is why the default names`,
      `host.docker.internal. On a Linux runner that name also has to resolve on`,
      `the host, for the browser's sake:`,
      ``,
      `  echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts`,
    ].join("\n"),
  );
}

function supabaseUrl() {
  return `http://host.docker.internal:${API_PORT}`;
}

const cmd = process.argv[2];

if (cmd === "env") {
  console.log(BASE_URL);
} else if (cmd === "up") {
  const tagArg = process.argv.indexOf("--tag");
  const tag = tagArg > -1 ? process.argv[tagArg + 1] : (process.env.SOJOURN_TAG ?? "latest");
  writeEnv(tag);
  await pullWithRetry();
  run([...COMPOSE, "up", "-d", "--wait"]);
  await waitForApp();
  await waitForAuth();
  await assertFreshInstall();
  console.log(`\nE2E_BASE_URL=${BASE_URL}`);
} else if (cmd === "down") {
  // -v: the database and storage volumes go too. A stack that keeps its data
  // between runs stops testing a fresh install, which is the thing under test.
  spawnSync("docker", [...COMPOSE, "down", "-v"], { stdio: "inherit", cwd: ROOT });
  rmSync(DIR, { recursive: true, force: true });
  console.log("stack down, volumes removed");
} else {
  console.error("usage: node scripts/e2e-stack.mjs <up|down|env> [--tag <tag>]");
  process.exit(1);
}
