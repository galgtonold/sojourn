import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Signing in, claiming the install and signing out all changed the session and
// then navigated softly — `router.push(href)` with `router.refresh()` on the
// very next line. That pairing is what all three observed failures had in
// common: a run stuck on /admin/login with the button reading "Anmelden…",
// another stuck on /admin/setup reading "Wird angelegt…", and the same once on
// a loaded laptop. Authentication had succeeded every time; the navigation
// after it had not, and `busy` is only cleared on the error path — so a push
// that never lands looks exactly like a click that did nothing, forever.
//
// Beyond the race, a soft navigation is simply the wrong instrument once the
// session has changed: the client router cache was filled under the old one.
// See @/lib/auth-navigate.
//
// A source-level check, because the thing being asserted is which navigation
// primitive these files reach for — that is not observable from their output.

const AUTH_TRANSITIONS = [
  "src/app/admin/login/page.tsx",
  "src/components/setup-form.tsx",
  "src/components/sign-out-button.tsx",
];

const code = (path: string) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

describe("navigating after the session changes", () => {
  it.each(AUTH_TRANSITIONS)("%s does a document load, not a soft push", (path) => {
    const src = code(path);
    expect(
      src,
      `${path} changes the session and must leave with navigateAfterAuth(). ` +
        "router.push() here races router.refresh() and reuses a client router " +
        "cache built under the previous session; when it does not land the " +
        "button stays disabled with no error and no way out.",
    ).toMatch(/navigateAfterAuth\s*\(/);
    expect(src).not.toMatch(/router\.(push|replace)\s*\(/);
  });

  it("keeps the previous page in history, so back does not show a stale screen", () => {
    const helper = readFileSync("src/lib/auth-navigate.ts", "utf8");
    expect(helper).toMatch(/location\.assign\s*\(/);
    // `location.href = …` replaces nothing but reads as equivalent; `replace()`
    // would drop the entry a signed-out reader needs to land on.
    expect(helper).not.toMatch(/location\.replace\s*\(/);
  });
});
