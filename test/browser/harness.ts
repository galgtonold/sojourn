import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { spawnSync } from "node:child_process";

/**
 * The part that makes this suite worth running.
 *
 * A journey test — sign in, write a post, look at it — passes straight through
 * every failure this project has actually had. The map renders with no data and
 * looks alive, because the raster tiles keep arriving. A page load costs 45 auth
 * round trips instead of 1. A slug loses `ø` and the URL is merely wrong, not
 * broken. None of that fails a script that only checks the happy path arrived.
 *
 * So the assertions here are about what must NOT be true, and they are attached
 * to every test automatically rather than left for a spec to remember.
 */

/** Same-origin request failures and browser-side errors, collected per test. */
type Silence = {
  /** Ignore a known-benign message. Pass a reason; unexplained mutes rot. */
  allow(pattern: RegExp, reason: string): void;
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: string[];
};

const ALLOWED_BY_DEFAULT: { pattern: RegExp; reason: string }[] = [
  {
    // Chrome asks for /favicon.ico on any page whose HTML does not name one; the
    // app serves an SVG icon instead, so this 404 is the browser's habit rather
    // than a broken reference.
    pattern: /\/favicon\.ico\b/,
    reason: "Chrome's implicit favicon probe; the app declares an SVG icon",
  },
];

function watchPage(page: Page, baseURL: string): Silence {
  const extra: { pattern: RegExp; reason: string }[] = [];
  const silence: Silence = {
    allow: (pattern, reason) => extra.push({ pattern, reason }),
    consoleErrors: [],
    pageErrors: [],
    failedResponses: [],
  };
  const allowed = (s: string) =>
    [...ALLOWED_BY_DEFAULT, ...extra].some(({ pattern }) => pattern.test(s));

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = `${msg.text()} @ ${msg.location().url}`;
    if (!allowed(text)) silence.consoleErrors.push(text);
  });

  // An uncaught exception in a client component. React swallows these into an
  // error boundary and the page keeps looking fine.
  page.on("pageerror", (err) => {
    const text = `${err.name}: ${err.message}`;
    if (!allowed(text)) silence.pageErrors.push(text);
  });

  page.on("response", (res) => {
    if (res.status() < 400) return;
    let url: URL;
    try {
      url = new URL(res.url());
    } catch {
      return;
    }
    // Only the app's own origin. A tile server having a bad day is not this
    // suite's business, and making it one is how a suite starts getting muted.
    if (url.host !== new URL(baseURL).host) return;
    const text = `${res.status()} ${res.request().method()} ${url.pathname}`;
    if (!allowed(text)) silence.failedResponses.push(text);
  });

  return silence;
}

function reportSilence(silence: Silence, info: TestInfo) {
  // If the body already failed, the first failure is the interesting one.
  if (info.status !== info.expectedStatus) return;

  const lines: string[] = [];
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`${title}:`);
    for (const item of [...new Set(items)]) lines.push(`  ${item}`);
  };
  section("Console errors", silence.consoleErrors);
  section("Uncaught page errors", silence.pageErrors);
  section("Failed same-origin requests", silence.failedResponses);

  expect(
    lines.join("\n"),
    "The journey completed, but the page was not silent. Each line below is a " +
      "failure the happy path did not notice. If one is genuinely benign, call " +
      "silence.allow(pattern, reason) in the spec — with the reason.",
  ).toBe("");
}

export const test = base.extend<{ silence: Silence }>({
  silence: [
    async ({ page, baseURL }, use, info) => {
      const silence = watchPage(page, baseURL ?? "http://localhost:3000");
      await use(silence);
      reportSilence(silence, info);
    },
    { auto: true },
  ],
});

export { expect };

// ── Round-trip budgets ──────────────────────────────────────────────────────

/**
 * Kong's access log is the only place that sees what the app asks Supabase for.
 * Server-rendered queries and middleware auth checks never touch the browser,
 * so Playwright's own network events cannot see them — and the worst regression
 * of this kind (45 auth calls per page load, one lockout) was entirely
 * server-side.
 *
 * COUNT DELTAS, NOT TOTALS. `docker logs` replays the container's whole history
 * every time, so a "count taken after" is cumulative and a real fix reads as no
 * change at all. That mistake has already been made twice on this project and
 * reported as "the fix had no effect" both times.
 */
const project = process.env.E2E_COMPOSE_PROJECT ?? "sojourn-e2e";

function kongLogLines(): string[] {
  const res = spawnSync("docker", ["logs", `${project}-kong-1`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) {
    throw new Error(
      `Cannot read Kong's log for compose project "${project}". ` +
        `Set E2E_COMPOSE_PROJECT if the stack runs under another name. ` +
        (res.stderr ?? res.error?.message ?? ""),
    );
  }
  return `${res.stdout}${res.stderr}`.split("\n");
}

function countMatching(pattern: RegExp): number {
  return kongLogLines().filter((line) => pattern.test(line)).length;
}

/** Requests Kong saw matching `pattern` while `fn` ran. */
export async function roundTrips(
  pattern: RegExp,
  fn: () => Promise<unknown>,
): Promise<number> {
  const before = countMatching(pattern);
  await fn();
  // Kong writes its access line when the response completes; give the last one
  // of a page render a moment to land before reading the log back.
  await new Promise((r) => setTimeout(r, 1500));
  return countMatching(pattern) - before;
}

/**
 * The control CLAUDE.md insists on: if doing nothing "costs" as many requests as
 * doing something, the number is not measuring what you think it is. Run this
 * before trusting any budget in the same spec.
 */
export async function assertIdleIsQuiet(pattern: RegExp, seconds = 5) {
  const idle = await roundTrips(pattern, () =>
    new Promise((r) => setTimeout(r, seconds * 1000)),
  );
  expect(
    idle,
    `${seconds}s of doing nothing produced ${idle} matching requests. Something ` +
      `is polling, or the pattern matches more than it should — either way the ` +
      `budgets below would be measuring noise.`,
  ).toBeLessThanOrEqual(2);
}

export const AUTH_CALLS = /"(GET|POST) \/auth\/v1\//;
export const REST_CALLS = /"(GET|POST|PATCH|DELETE) \/rest\/v1\//;

// ── Map liveness ────────────────────────────────────────────────────────────

/**
 * A map that renders and holds no data is this project's most-repeated bug, and
 * it is invisible to a screenshot: raster tiles keep arriving, so the basemap
 * looks alive while the vector source never finishes and `map.on('load')` never
 * fires.
 *
 * Everything the app adds — sources, layers, markers — happens inside that load
 * handler. MapLibre markers are real DOM, so their presence is proof the handler
 * ran. Asserting the canvas separately splits "the map never mounted" from "the
 * map mounted and its worker died", which are different bugs with the same
 * screenshot.
 */
export async function expectMapAlive(page: Page, { markers = true } = {}) {
  await expect(
    page.locator("canvas.maplibregl-canvas"),
    "No MapLibre canvas — the map component did not mount at all.",
  ).toBeVisible({ timeout: 45_000 });

  if (!markers) return;
  await expect(
    page.locator(".maplibregl-marker").first(),
    "Canvas is present but no marker was ever added, so map.on('load') never " +
      "fired. That is the maplibre worker failing silently — see CLAUDE.md. " +
      "The map will look perfectly fine in a screenshot.",
  ).toBeAttached({ timeout: 45_000 });
}
