import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

// First-run detection. "unknown" means we cannot tell — no service role, or the
// owner lookup failed (e.g. migrations not applied yet) — and callers degrade
// gracefully: the login page skips its setup redirect, the setup page shows the
// manual instructions instead of the claim form.
export type SetupState = "needs-setup" | "configured" | "unknown";

type AdminClient = NonNullable<ReturnType<typeof getAdminSupabase>>;

/** Whether an owner profile exists; null when the lookup itself failed. */
export async function hasOwner(admin: AdminClient): Promise<boolean | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "owner")
    .limit(1);
  if (error) return null;
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

// How long an unclaimed install stays claimable. The window exists so a deploy
// that is never finished doesn't sit there indefinitely with its ownership up
// for grabs; it is not a defence against someone racing the operator, which
// only an out-of-band secret would give. Reopening it takes one SQL statement,
// which the setup page prints — the serverless equivalent of Portainer's
// "restart the container".
export type ClaimWindow = "open" | "expired";

/** Pure so the clock can be tested; fails OPEN on anything unreadable. */
export function claimWindowState(
  openedAt: string | null,
  windowMinutes: number,
  now: number,
): ClaimWindow {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return "open";
  if (!openedAt) return "open";
  const started = new Date(openedAt).getTime();
  if (!Number.isFinite(started)) return "open";
  return now < started + windowMinutes * 60_000 ? "open" : "expired";
}

/**
 * Identifies the running deployment, so a restart can reopen a lapsed window.
 *
 * It must be the DEPLOYMENT, not the process. Serverless cold starts happen
 * constantly, so a per-process id would hand out a fresh window on nearly every
 * request and quietly turn the guard off. Vercel's deployment identifiers stay
 * put across cold starts and change only on redeploy — which is precisely the
 * gesture we want to honour. Anywhere else (Docker, a VPS) one process really
 * is one server run, so a per-process id means exactly "restarted".
 */
export function deriveInstance(
  e: Record<string, string | undefined>,
  bootMs: number | null,
): string {
  const deployment =
    e.VERCEL_DEPLOYMENT_ID || e.VERCEL_URL || e.VERCEL_GIT_COMMIT_SHA;
  if (deployment) return deployment;
  // On Vercel with no identifier exposed, pin it rather than inventing one:
  // silently disabling the guard is worse than leaving SQL as the way back in.
  if (e.VERCEL) return "vercel";
  if (bootMs === null) return "unknown-boot";
  // Approximate boot time. Deliberately not a random id: off-Vercel this may be
  // derived by more than one worker, and a clock they share beats a coin each
  // of them flips separately.
  return `boot-${Math.floor(bootMs / 1000)}`;
}

// Cached on globalThis, not in module scope. Next compiles the page and the
// route handler into separate bundles, so module scope is NOT shared between
// them — the first version of this cached per-module and the two disagreed,
// which let /api/setup treat itself as a new deployment and reopen the window
// the page had just refused. One Node process has one globalThis; that is the
// only thing both bundles genuinely share.
const INSTANCE_KEY = "__sojourn_setup_instance";

/** Lazy so the edge bundle (middleware imports this module) never evaluates
 *  `process.uptime`, which the edge runtime does not provide. */
export function currentInstance(): string {
  const g = globalThis as Record<string, unknown>;
  const cached = g[INSTANCE_KEY];
  if (typeof cached === "string") return cached;
  const bootMs =
    typeof process.uptime === "function"
      ? Date.now() - process.uptime() * 1000
      : null;
  const value = deriveInstance(process.env, bootMs);
  g[INSTANCE_KEY] = value;
  return value;
}

/** Pure: what the stored row means for this deployment, and whether to rewrite it. */
export function claimWindowDecision(
  stored: { openedAt: string | null; instance: string | null },
  instance: string,
  windowMinutes: number,
  now: number,
): { state: ClaimWindow; reopen: boolean } {
  const state = claimWindowState(stored.openedAt, windowMinutes, now);
  // Only bother reopening when the window would otherwise be shut: no row
  // churn on every visit while it is still running, or when the guard is off.
  if (state === "expired" && stored.instance !== instance) {
    return { state: "open", reopen: true };
  }
  return { state, reopen: false };
}

/**
 * The live window for this install. Anything unknowable counts as open.
 *
 * Callers must already know the install is unclaimed (both do) — a claimed
 * install never consults this.
 */
export async function getClaimWindow(): Promise<ClaimWindow> {
  const admin = getAdminSupabase();
  if (!admin) return "open";
  const { data, error } = await admin
    .from("site_settings")
    .select("setup_opened_at, setup_instance")
    .eq("id", 1)
    .maybeSingle();
  if (error) return "open";
  const row = data as {
    setup_opened_at?: string | null;
    setup_instance?: string | null;
  } | null;

  const instance = currentInstance();
  const { state, reopen } = claimWindowDecision(
    { openedAt: row?.setup_opened_at ?? null, instance: row?.setup_instance ?? null },
    instance,
    env.setupWindowMinutes,
    Date.now(),
  );

  if (reopen) {
    // Restarted or redeployed since the window lapsed: grant another one, and
    // record the deployment so this happens once rather than on every visit.
    await admin
      .from("site_settings")
      .update({
        setup_opened_at: new Date().toISOString(),
        setup_instance: instance,
      })
      .eq("id", 1);
  }
  return state;
}

export async function getSetupState(): Promise<SetupState> {
  const admin = getAdminSupabase();
  if (!admin) return "unknown";
  const owned = await hasOwner(admin);
  if (owned === null) return "unknown";
  return owned ? "configured" : "needs-setup";
}
