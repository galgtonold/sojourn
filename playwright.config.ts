import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end, against a real all-in-one stack.
 *
 * Specs are `test/browser/*.spec.ts`, NOT `*.test.ts` — Vitest's include glob
 * is `test/**\/*.test.ts` and would otherwise try to run them in node, where
 * `@playwright/test` has no runner and the failure is confusing.
 *
 * No `webServer` block: the stack is brought up outside this config (see
 * scripts/e2e-stack.mjs and the `e2e` job in .github/workflows/ci.yml) because
 * it is a six-container compose project, not a dev server, and the same stack
 * serves several specs.
 */
export default defineConfig({
  testDir: "./test/browser",
  testMatch: /.*\.spec\.ts$/,

  // The journey builds on itself — the trip has to exist before a post can join
  // it — so these run in order, in one worker, against one stack.
  fullyParallel: false,
  workers: 1,

  // A flake that gets retried is a flake that gets ignored. If something here is
  // genuinely racy, fix the wait rather than paper over it: this suite exists to
  // catch silent breakage, and a retry is how silence gets back in.
  retries: 0,

  // Generous: a cold Next.js server rendering its first ISR page on a CI runner
  // is slow in a way that is not a bug.
  timeout: 90_000,
  expect: { timeout: 20_000 },

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
