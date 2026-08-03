// What version of Sojourn this is, and whether some other version is newer.
//
// The version comes from package.json, which is the same string the release tag
// carries (`v0.1.0`). It deliberately is NOT `NEXT_PUBLIC_SW_VERSION` — that is
// a 12-character commit SHA whose only job is to name the service worker's
// cache per deploy. A SHA does not order, and means nothing to a reader.

import pkg from "../../package.json";

/** e.g. "0.1.0". Server-side only — nothing public needs to advertise this. */
export const SOJOURN_VERSION: string = pkg.version;

type Parsed = { core: number[]; prerelease: string | null };

/**
 * Enough semver to compare two release tags, and no more.
 *
 * Accepts a leading `v` because that is how the tags are written but not how
 * package.json writes it, and those two strings have to be comparable.
 * Returns null for anything unparseable, so a garbled tag from an API reads as
 * "cannot tell" rather than as a version that happens to sort low.
 */
export function parseVersion(raw: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(raw.trim());
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    prerelease: m[4] ?? null,
  };
}

/**
 * -1 / 0 / 1, or null if either side is unparseable.
 *
 * A prerelease sorts *below* the release it precedes (1.2.0-rc.1 < 1.2.0), per
 * semver. That matters here in one direction only: it stops an `-rc` tag on the
 * same numbers from being announced as an upgrade to a stable install.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;

  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  }
  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return pa.prerelease < pb.prerelease ? -1 : 1;
}

/**
 * Is `latest` worth telling the operator about?
 *
 * Unparseable input answers false rather than true. Being told about an update
 * that does not exist is worse than not being told about one that does: it
 * sends someone to redeploy a site that was fine.
 */
export function isNewerRelease(
  latest: string,
  current: string = SOJOURN_VERSION,
): boolean {
  return compareVersions(latest, current) === 1;
}
