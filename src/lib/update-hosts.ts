// Which host this is running on, and the gesture that updates it there.
//
// Updating the code stays a platform gesture, because none of the three hosts
// can rebuild themselves —
// the Docker runner image has no source or toolchain, Vercel's filesystem is
// read-only, and a bare-metal rebuild is the case least safe to attempt from
// inside the process being replaced.
//
// So the admin's job is to name the right gesture rather than perform it. Which
// means naming it for the host actually in use: three sets of instructions with
// two crossed out is how a reader ends up running the wrong one.

import type { DictKey } from "@/lib/i18n";

export type HostKind = "vercel" | "docker" | "node";

/**
 * `SOJOURN_RUNTIME` is set by our own Dockerfile, so the container knows what it
 * is without sniffing for `/.dockerenv` — which is absent under Podman and
 * present in plenty of things that are not our image. Vercel sets `VERCEL`
 * itself. Anything else is a plain Node process: a VPS, a Pi, someone's laptop.
 */
export function detectHost(env: Record<string, string | undefined>): HostKind {
  if (env.SOJOURN_RUNTIME === "docker") return "docker";
  if (env.VERCEL) return "vercel";
  return "node";
}

export type UpdateRecipe = {
  host: HostKind;
  /** What to call this host in the UI. */
  label: DictKey;
  /** The gesture, in prose. */
  intro: DictKey;
  /** Literal shell — deliberately not translated. Null when the gesture is not
   *  a command at all, which is the Vercel case: it is a button on GitHub. */
  command: string | null;
  /** Anything the command alone leaves unsaid. */
  note: DictKey | null;
};

const RECIPES: Record<HostKind, UpdateRecipe> = {
  // The one-click already exists — it is just GitHub's, not ours. A fork synced
  // from upstream pushes to the operator's `main`, and their existing Vercel
  // hook deploys it. Nothing to install, nothing to run.
  vercel: {
    host: "vercel",
    label: "admin.updates.hostVercel",
    intro: "admin.updates.recipeVercel",
    command: null,
    note: "admin.updates.recipeVercelNote",
  },
  // This used to be `git pull && docker compose up -d --build`, from when
  // docker-compose.yml built from source because nothing was published. GHCR
  // now carries :latest and :X.Y.Z, so the gesture is a pull — and the old one
  // was worse than merely long: it assumed a checkout, which self-hosting has
  // not needed since the stack stopped bind-mounting its config, and it
  // recompiled Next on the operator's box to arrive at the image they could
  // have downloaded.
  docker: {
    host: "docker",
    label: "admin.updates.hostDocker",
    intro: "admin.updates.recipeDocker",
    command: "docker compose pull && docker compose up -d",
    note: "admin.updates.recipeDockerNote",
  },
  // The honest worst case, and the reason there is no button: this rebuild is
  // memory-hungry, takes the site down while it runs, and leaves no way back if
  // it fails. Fine to do deliberately; not fine to trigger from a web page.
  node: {
    host: "node",
    label: "admin.updates.hostNode",
    intro: "admin.updates.recipeNode",
    command: "git pull && npm ci && npm run build",
    note: "admin.updates.recipeNodeNote",
  },
};

export function updateRecipe(host: HostKind): UpdateRecipe {
  return RECIPES[host];
}
