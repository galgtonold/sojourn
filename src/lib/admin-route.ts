import type { SetupState } from "@/lib/setup";

// An unclaimed install has nothing to show — its database is empty and its
// ownership is still up for grabs — so every public route funnels into setup.
// Without this, a deploy lands the operator on an empty home page with no hint
// that the site is unclaimed, and it can sit that way indefinitely.
//
// `unknown` deliberately serves the site: a missing service-role key or a
// database blip must never black out a working install.
export function resolvePublicRoute(state: SetupState): string | null {
  return state === "needs-setup" ? "/admin/setup" : null;
}

// Where an /admin/* request should go, or null to render what was asked for.
// This is the single decision point for the admin gate: middleware can act on
// it with a real 307, so a fresh install never renders a page it is about to
// redirect away from (Next streams the layout shell before an in-page
// `redirect()` resolves, which showed as a bare footer flashing by).
//
// `getState` is lazy on purpose — the setup lookup is a database round-trip,
// and the common case (a signed-in owner) must not pay for it.
export async function resolveAdminRoute(
  pathname: string,
  hasUser: boolean,
  getState: () => Promise<SetupState>,
): Promise<string | null> {
  const isLogin = pathname.startsWith("/admin/login");
  const isSetup = pathname.startsWith("/admin/setup");
  // The invite/recovery link establishes its session client-side, so the
  // welcome page must stay reachable before a session cookie exists.
  const isWelcome = pathname.startsWith("/admin/welcome");

  if (hasUser) return isLogin || isSetup ? "/admin" : null;

  // The invite flow carries its own token; it never depends on setup state.
  if (isWelcome) return null;

  // Everything else hinges on whether this install has been claimed yet, so
  // this is the one place worth paying for the lookup.
  const state = await getState();
  if (state === "needs-setup") return isSetup ? null : "/admin/setup";
  // Claimed (or unknowable): setup is spent, login is the way in. `unknown`
  // still renders setup so it can explain what is missing.
  if (isSetup) return state === "unknown" ? null : "/admin/login";
  return isLogin ? null : "/admin/login";
}
