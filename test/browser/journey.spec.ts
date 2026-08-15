import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  test,
  expect,
  roundTrips,
  assertIdleIsQuiet,
  expectMapAlive,
  AUTH_CALLS,
} from "./harness";

/**
 * The journey cannot produce a geotagged photograph — that needs an upload with
 * GPS EXIF — so the map would have nothing to draw and its assertion nothing to
 * assert. See test/browser/seed-geo.mjs.
 */
function seedGeotaggedPhoto() {
  const env = readFileSync(".e2e/.env", "utf8");
  const key = env.match(/^SUPABASE_SERVICE_KEY=(.+)$/m)?.[1]?.trim();
  const url = env.match(/^SUPABASE_PUBLIC_URL=(.+)$/m)?.[1]?.trim();
  if (!key || !url) throw new Error("no service key in .e2e/.env — is the stack up?");
  const out = execFileSync(
    process.execPath,
    ["test/browser/seed-geo.mjs", url, key],
    { encoding: "utf8" },
  );
  console.log(out.trim());
}

/**
 * A fresh install, driven the way the docs tell a reader to drive it: claim the
 * owner account, write a trip and some posts, then read the public site back as
 * a stranger.
 *
 * Every test also carries the invariants in harness.ts automatically — no
 * console errors, no uncaught exceptions, no failed same-origin requests. Those
 * are what catch the failures this project actually has; the steps below are
 * mostly here to make something happen while they watch.
 */

const OWNER = {
  site: "Nordlicht Journal",
  email: "owner@nordlicht.test",
  password: "nordlicht-e2e-2026",
};

const TRIP = {
  title: "Lofoten im Winterlicht",
  summary: "Zehn Tage zwischen Reine und Å, mit mehr Nordlicht als Schlaf.",
};

// Titles chosen to exercise the slug pipeline, not for flavour: ß and ø have no
// NFKD decomposition and used to vanish, and a title that transliterates to
// nothing at all used to write an empty slug into a `not null unique` column.
const POSTS = [
  {
    title: "Reine, und die Nacht in der es endlich klappte",
    slug: "reine-und-die-nacht-in-der-es-endlich-klappte",
    body: "Vier Nächte lang nichts als Wolken. In der fünften stand das Nordlicht über dem Fjord.",
  },
  {
    title: "Å, am Ende der Straße",
    slug: "a-am-ende-der-strasse",
    body: "Die E10 hört einfach auf. Dahinter Stockfischgestelle und sehr viel Wind.",
  },
  {
    title: "Tromsø, zwischen zwei Zügen",
    slug: "tromso-zwischen-zwei-zugen",
    body: "Ein Zwischenstopp, der länger wurde als geplant.",
  },
];

test.describe.configure({ mode: "serial" });

test("a fresh install funnels to setup and claims an owner", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin\/setup/);

  const fields = page.locator("form input");
  await fields.nth(0).fill(OWNER.site);
  await fields.nth(1).fill(OWNER.email);
  await fields.nth(2).fill(OWNER.password);
  if ((await fields.count()) > 3) await fields.nth(3).fill(OWNER.password);
  await page.locator("form button[type=submit]").first().click();

  // Claiming signs the owner in; the setup route must stop offering itself.
  await expect(page).toHaveURL(/\/admin(?!\/setup)/, { timeout: 60_000 });
});

test("the admin stays signed in under repeated navigation", async ({ page }) => {
  await signIn(page);

  // The bug this replaces: every admin page load spent ~45 auth round trips, so
  // a few quick reloads tripped the gateway's rate limit and the app reported it
  // as a logout. Reloading is the cheapest way to reproduce that class.
  for (let i = 0; i < 6; i++) {
    await page.goto("/admin");
    await expect(page.locator("body")).not.toContainText(/rate limit/i);
  }
  await expect(page).toHaveURL(/\/admin$/);
});

test("one admin page load stays within its auth round-trip budget", async ({
  page,
}) => {
  await signIn(page);

  // Before trusting any number from the gateway log, prove the log is quiet when
  // nothing is happening. Without this control a background poll makes every
  // budget below meaningless — and reads as a passing test.
  await assertIdleIsQuiet(AUTH_CALLS);

  const calls = await roundTrips(AUTH_CALLS, async () => {
    await page.goto("/admin");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  // One verification per load is the target; the budget leaves room for a
  // prefetch without leaving room for a regression. It was 45.
  expect(
    calls,
    `An /admin load cost ${calls} auth round trips. The middleware is verifying ` +
      `the session more than once per navigation — see the session cache in ` +
      `src/lib/session-verify.ts.`,
  ).toBeLessThanOrEqual(6);
});

test("an author can create a trip", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/trips/new");
  await page.getByPlaceholder("Titel der Reise").fill(TRIP.title);
  await page.getByPlaceholder("Zusammenfassung").fill(TRIP.summary);
  await page.getByRole("button", { name: "Speichern" }).first().click();

  // Saving returns to the dashboard — there is no /admin/trips list page, trips
  // are managed from /admin. Assert the trip itself, not the URL: landing
  // somewhere is not evidence that anything was written.
  await expect(page).toHaveURL(/\/admin$/, { timeout: 60_000 });
  await expect(page.getByText(TRIP.title).first()).toBeVisible();
});

test("an author can write and publish posts", async ({ page }) => {
  await signIn(page);

  for (const post of POSTS) {
    // /admin/posts/new creates the draft server-side and redirects to its
    // editor. Filling the form before that lands types into a page about to be
    // replaced, and produces an empty draft with no error anywhere.
    await page.goto("/admin/posts/new");
    await page.waitForURL(/\/admin\/posts\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // The trip selector is open from the start — clicking the "Reise" heading
    // COLLAPSES it. Nothing here may swallow a failure: a silently unselected
    // trip leaves Veröffentlichen disabled, and the run then fails several
    // steps later on a timeout that describes none of this.
    const trip = page.locator("select").first();
    await expect(trip).toBeVisible();
    await trip.selectOption({ label: TRIP.title });
    expect(await trip.inputValue(), "the trip did not take").not.toBe("");

    // The article section is collapsed, so the title field is not in the DOM
    // until it is opened.
    const title = page.getByPlaceholder("Titel").first();
    if (!(await title.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^Artikel/ }).first().click();
    }
    await expect(title).toBeVisible();
    await title.fill(post.title);

    const body = page.locator("[contenteditable]").first();
    await body.click();
    await body.fill(post.body);

    await page.getByRole("button", { name: "Speichern" }).first().click();
    await page.waitForTimeout(2000);
    await publish(page);
  }
});

test("the slug survives ß and ø", async ({ page }) => {
  // Not cosmetic. These titles used to slug to `a-am-ende-der-stra-e` and
  // `tromso` losing its ø entirely, because NFKD has no decomposition for a
  // stroked or ligature letter. The URLs below are the assertion.
  for (const post of POSTS) {
    const res = await page.goto(`/posts/${post.slug}`);
    expect(
      res?.status(),
      `/posts/${post.slug} did not resolve. The slug pipeline dropped a ` +
        `character from "${post.title}" — see src/lib/slug.ts.`,
    ).toBeLessThan(400);
    await expect(page.locator("h1").first()).toContainText(post.title);
  }
});

test("a stranger sees the published site", async ({ browser }) => {
  // A fresh context: no session, no cache, nothing the author's browser warmed.
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await expect(page).toHaveTitle(new RegExp(OWNER.site));

  await page.goto("/posts");
  for (const post of POSTS) {
    await expect(page.getByText(post.title, { exact: false }).first()).toBeVisible();
  }

  await page.goto("/trips");
  await expect(page.getByText(TRIP.title).first()).toBeVisible();

  await page.goto("/search");
  await expect(page.locator("h1").first()).toBeVisible();

  await context.close();
});

test("an empty install says so instead of drawing an empty map", async ({ page }) => {
  // Before any geodata exists, /map must render its empty state — the map
  // component does not mount at all. Worth pinning: "no photographs are located
  // yet" and "the map broke" look identical to a user, and only one of them
  // should ever be what this page means.
  await page.goto("/map");
  await expect(page.getByText(/Noch nichts eingezeichnet/i)).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
});

test("the map holds data, not just a basemap", async ({ page }) => {
  seedGeotaggedPhoto();

  // /map is prerendered at build time and revalidates hourly, so the container
  // is still serving the empty build-time HTML — the seed went straight to the
  // database and no Next cache knows about it. Saving a post runs the admin
  // route's revalidatePath("/map"), which is the app's own mechanism for
  // exactly this. Driving it here means an invalidation regression — publish
  // something, the map never updates — fails as this test rather than as a
  // reader wondering why their photographs are missing.
  await signIn(page);
  await page.goto("/admin/posts");
  await page.getByRole("link", { name: new RegExp(POSTS[0].title) }).first().click();
  await page.waitForURL(/\/admin\/posts\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await page.waitForTimeout(4000);

  await page.goto("/map");
  // The whole point: a broken worker still paints a convincing basemap.
  await expectMapAlive(page);
});

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Get this page a signed-in session. Not "prove the login redirect works" —
 * that is a different claim, and the test above ("a fresh install funnels to
 * setup and claims an owner") is where it is made.
 *
 * This waited on the URL leaving /admin/login, which made every test below
 * depend on a client-side navigation completing. The login handler awaits
 * signInWithPassword and then calls router.push("/admin") followed immediately
 * by router.refresh(); on a loaded CI runner that occasionally did not land, so
 * a run died on the third sign-in with the button still reading "Anmelden…".
 * Authentication had succeeded — all three token requests returned 200 and
 * there was no 5xx or 429 anywhere — which is exactly why hanging seven
 * unrelated tests off it was the wrong shape.
 *
 * So wait for the thing those tests actually need: the session cookie. Then go
 * to /admin directly if the redirect has not already taken us there. A real
 * regression in signing in still fails here — no session, no cookie — and a
 * slow navigation no longer reads as a broken login.
 */
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  // Already signed in from a previous test in this serial file.
  if (!page.url().includes("/admin/login")) return;
  await page.locator("form input").nth(0).fill(OWNER.email);
  await page.locator("form input").nth(1).fill(OWNER.password);
  await page.locator("form button[type=submit]").first().click();

  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((c) => /^sb-.*auth-token/.test(c.name)),
      {
        timeout: 60_000,
        message:
          "no Supabase session cookie after submitting the login form — the " +
          "sign-in itself failed, not the navigation that follows it",
      },
    )
    .toBe(true);

  if (page.url().includes("/admin/login")) await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 30_000 });
}

/**
 * Publishing asks "proofread first?" and does nothing until that is answered.
 * A script that clicks Veröffentlichen and moves on leaves the post a draft,
 * and every later assertion fails somewhere unrelated.
 */
async function publish(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: "Veröffentlichen" }).first();

  // Assert the gate rather than clicking into it. The button is disabled until
  // the post has both a title and a trip, and clicking a disabled button just
  // times out with a message about visibility that explains nothing.
  await expect(
    button,
    "Veröffentlichen is still disabled — the editor considers the post " +
      "incomplete (it needs both a title and a trip).",
  ).toBeEnabled();
  await button.click();

  const anyway = page.getByRole("button", { name: /Trotzdem veröffentlichen/i });
  await anyway.click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3000);
}
