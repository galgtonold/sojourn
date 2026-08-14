// The upstream images CI needs, and where they are mirrored to.
//
//   node scripts/mirror-images.mjs list     # "<source> <destination>" per line
//   node scripts/mirror-images.mjs check    # assert docker-compose.ci.yml agrees
//
// Read out of docker-compose.all-in-one.yml rather than written down twice, so
// bumping a Supabase version cannot leave the mirror pointing at the old one.
//
// ── Why mirror at all ───────────────────────────────────────────────────────
//
// public.ecr.aws limits anonymous pulls per source IP, and a GitHub runner
// shares its IP with every other runner in that range. The browser suite's
// first CI runs could not fetch the images at all — four attempts, ninety
// seconds of backoff, `toomanyrequests` every time — which has nothing to do
// with the commit under test and left the suite skipping.
//
// The mirror is pulled with the workflow's own GITHUB_TOKEN. Its packages are
// public, because Actions-published packages inherit the repository's
// visibility — see docker-compose.ci.yml. It is a CI convenience either way:
// the all-in-one file people actually install with still points at upstream,
// and test/unit/mirror-images.test.ts asserts it always will.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ALL_IN_ONE = path.join(ROOT, "docker-compose.all-in-one.yml");
const CI_OVERLAY = path.join(ROOT, "docker-compose.ci.yml");

export const MIRROR_PREFIX = "ghcr.io/galgtonold/sojourn-mirror";

/** Every `public.ecr.aws/...` image the all-in-one stack runs. */
export function upstreamImages() {
  const text = readFileSync(ALL_IN_ONE, "utf8");
  const found = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*image:\s*(public\.ecr\.aws\/\S+)\s*$/);
    if (!m) continue;
    const source = m[1];
    // "public.ecr.aws/supabase/postgres:17.6.1.147" -> "postgres", tag
    const [repoPath, tag] = source.split(":");
    const name = repoPath.split("/").pop();
    found.set(source, { source, name, tag, destination: `${MIRROR_PREFIX}/${name}:${tag}` });
  }
  return [...found.values()];
}

/**
 * The overlay is a compose file, so its image list has to be literal. This is
 * what stops the two drifting: bump a version in the all-in-one file and forget
 * the overlay, and `check` fails rather than CI silently running last month's
 * Postgres against this month's migrations.
 */
export function checkOverlay() {
  const overlay = readFileSync(CI_OVERLAY, "utf8");
  const problems = [];
  for (const { source, destination } of upstreamImages()) {
    if (!overlay.includes(destination)) {
      problems.push(`${source}\n    overlay is missing: image: ${destination}`);
    }
  }
  // And nothing pinned in the overlay that upstream no longer runs.
  const expected = new Set(upstreamImages().map((i) => i.destination));
  for (const line of overlay.split("\n")) {
    const m = line.match(/^\s*image:\s*(\S+)\s*$/);
    if (m && m[1].startsWith(MIRROR_PREFIX) && !expected.has(m[1])) {
      problems.push(`${m[1]}\n    overlay pins an image the all-in-one stack no longer runs`);
    }
  }
  return problems;
}

const cmd = process.argv[2];
if (cmd === "list") {
  for (const { source, destination } of upstreamImages()) {
    console.log(`${source} ${destination}`);
  }
} else if (cmd === "check") {
  const problems = checkOverlay();
  if (problems.length) {
    console.error("docker-compose.ci.yml does not match the all-in-one stack:\n");
    for (const p of problems) console.error(`  ${p}\n`);
    process.exit(1);
  }
  console.log(`docker-compose.ci.yml mirrors all ${upstreamImages().length} upstream images`);
} else if (cmd) {
  console.error("usage: node scripts/mirror-images.mjs <list|check>");
  process.exit(1);
}
