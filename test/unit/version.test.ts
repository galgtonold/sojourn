import { describe, it, expect } from "vitest";
import {
  SOJOURN_VERSION,
  parseVersion,
  compareVersions,
  isNewerRelease,
} from "@/lib/version";

// One direction of error here is much worse than the other. Announcing an
// update that does not exist sends someone to redeploy a site that was fine —
// possibly at 2am, possibly badly. Missing one just means being a version
// behind for a while. So every ambiguous case answers "no update".

describe("parsing a version", () => {
  it("accepts the tag spelling and the package.json spelling alike", () => {
    // The release tag is `v0.1.0`; package.json says `0.1.0`. They have to be
    // comparable or the page announces an update to the version it is running.
    expect(parseVersion("v0.1.0")).toEqual(parseVersion("0.1.0"));
  });

  it("keeps a prerelease suffix", () => {
    expect(parseVersion("1.2.0-rc.1")?.prerelease).toBe("rc.1");
    expect(parseVersion("1.2.0")?.prerelease).toBeNull();
  });

  it("returns null for anything it cannot read", () => {
    for (const bad of ["", "latest", "v1", "1.2", "nightly-2026-08-03"]) {
      expect(parseVersion(bad), bad).toBeNull();
    }
  });
});

describe("comparing versions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("0.1.2", "0.1.10")).toBe(-1);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("does not compare numbers as strings", () => {
    // The bug this catches: "0.1.10" < "0.1.9" lexically, so a lazy compare
    // would tell a 0.1.10 install to downgrade.
    expect(compareVersions("0.1.10", "0.1.9")).toBe(1);
  });

  it("sorts a prerelease below the release it precedes", () => {
    expect(compareVersions("1.2.0-rc.1", "1.2.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.2.0-rc.1")).toBe(1);
  });

  it("gives up rather than guessing", () => {
    expect(compareVersions("nightly", "0.1.0")).toBeNull();
    expect(compareVersions("0.1.0", "")).toBeNull();
  });
});

describe("deciding whether to tell the operator", () => {
  it("says yes only when the release is genuinely newer", () => {
    expect(isNewerRelease("v0.2.0", "0.1.0")).toBe(true);
    expect(isNewerRelease("v0.1.0", "0.1.0")).toBe(false);
    expect(isNewerRelease("v0.0.9", "0.1.0")).toBe(false);
  });

  it("stays quiet when it cannot tell", () => {
    // A garbled tag from the API must not read as an upgrade.
    expect(isNewerRelease("", "0.1.0")).toBe(false);
    expect(isNewerRelease("main", "0.1.0")).toBe(false);
  });

  it("does not announce an rc as an upgrade to the matching release", () => {
    expect(isNewerRelease("v0.1.0-rc.2", "0.1.0")).toBe(false);
  });

  it("defaults to comparing against this build", () => {
    expect(isNewerRelease(`v${SOJOURN_VERSION}`)).toBe(false);
  });
});

describe("the running version", () => {
  it("is a real semver, because the release tag has to match it", () => {
    expect(parseVersion(SOJOURN_VERSION)).not.toBeNull();
  });
});
