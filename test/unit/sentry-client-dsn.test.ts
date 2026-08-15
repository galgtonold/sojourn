import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { publicConfigFromEnv } from "@/lib/public-config";

// Three places decide whether browser error reporting is on, and they have to
// agree. Only `instrumentation-client.ts` can actually initialise the SDK; the
// error boundaries and the admin's privacy page merely *believe* it has been.
//
// When they disagreed, the disagreement was silent in both directions that
// matter: the admin said reporting was ON, the boundary called
// captureException, and the SDK had never been initialised — so nothing was
// sent and nothing complained. That is only reachable on a prebuilt image,
// which is to say on every self-hosted install, because NEXT_PUBLIC_* is
// inlined at build and the published image is built with no DSN.

const CLIENT = readFileSync("src/instrumentation-client.ts", "utf8");
const source = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

describe("browser Sentry DSN", () => {
  it("SENTRY_DSN_CLIENT wins over the build-time name", () => {
    const config = publicConfigFromEnv({
      SENTRY_DSN_CLIENT: "https://runtime@example.ingest.sentry.io/1",
      NEXT_PUBLIC_SENTRY_DSN: "https://baked-in@example.ingest.sentry.io/2",
    });
    expect(config.sentryDsnClient).toBe("https://runtime@example.ingest.sentry.io/1");
  });

  it("falls back to the build-time value when no runtime name is set", () => {
    const config = publicConfigFromEnv({
      NEXT_PUBLIC_SENTRY_DSN: "https://baked-in@example.ingest.sentry.io/2",
    });
    expect(config.sentryDsnClient).toBe("https://baked-in@example.ingest.sentry.io/2");
  });

  it("is off when neither is set", () => {
    expect(publicConfigFromEnv({}).sentryDsnClient).toBe("");
  });

  // The regression itself. Reading only the inlined name means the SDK can
  // never be initialised on a prebuilt image, however the operator configures
  // it — while everything that reports *about* reporting says it is on.
  it("the SDK reads the runtime config, not just the inlined name", () => {
    const code = source("src/instrumentation-client.ts");
    expect(
      code,
      "instrumentation-client.ts must resolve the DSN through @/lib/public-config. " +
        "Reading process.env.NEXT_PUBLIC_SENTRY_DSN alone works on Vercel and " +
        "silently never initialises on a published image, where the admin will " +
        "still report browser error reporting as on.",
    ).toMatch(/injectedPublicConfig\s*\(/);
  });

  it("still honours the inlined name as a fallback", () => {
    expect(CLIENT).toMatch(/process\.env\.NEXT_PUBLIC_SENTRY_DSN/);
  });

  it("keeps the SDK out of the bundle of an install that has no DSN", () => {
    // A static `import * as Sentry from "@sentry/nextjs"` would ship the SDK to
    // every visitor of every install, configured or not.
    expect(CLIENT).not.toMatch(/^\s*import\s+[^;]*from\s+["']@sentry\/nextjs["']/m);
    expect(CLIENT).toMatch(/import\(\s*["']@sentry\/nextjs["']\s*\)/);
  });
});
