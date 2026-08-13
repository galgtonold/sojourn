import { describe, it, expect, beforeEach } from "vitest";
import {
  hasSessionCookie,
  cachedVerification,
  rememberVerification,
  resetVerificationCache,
  VERIFY_TTL_MS,
  VERIFY_MAX_ENTRIES,
} from "@/lib/session-verify";

// Middleware verifies the session on every request it matches — a network round
// trip to Supabase Auth. That is right per request and ruinous per page load:
// Next prefetches every <Link> in the viewport and each prefetch runs the
// middleware, so one measured /admin load was 1 navigation and 23 prefetches.
// Against the all-in-one stack's 30/minute login limit that locked the owner
// out of a fresh install seconds after claiming it.

beforeEach(() => resetVerificationCache());

describe("hasSessionCookie", () => {
  it("recognises the cookie @supabase/ssr actually writes", () => {
    expect(hasSessionCookie(["sb-abcdefgh-auth-token"])).toBe(true);
  });

  it("recognises the chunked spelling, which is what a real session uses", () => {
    // A session with a sizeable JWT does not fit one cookie, so ssr splits it
    // into .0/.1 — and the unchunked name is then absent entirely. Matching
    // only the unsplit name would report "no session" for every real login.
    expect(hasSessionCookie(["sb-abcdefgh-auth-token.0"])).toBe(true);
    expect(hasSessionCookie(["sb-abcdefgh-auth-token.0", "sb-abcdefgh-auth-token.1"])).toBe(true);
  });

  it("ignores everything else a browser sends", () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie(["NEXT_LOCALE", "sojourn-theme"])).toBe(false);
    // Near-misses: no project ref, or a suffix that is not a chunk index.
    expect(hasSessionCookie(["sb--auth-token"])).toBe(false);
    expect(hasSessionCookie(["sb-abc-auth-token.x"])).toBe(false);
    expect(hasSessionCookie(["sb-abc-auth-token-backup"])).toBe(false);
  });
});

describe("cachedVerification", () => {
  it("is a miss before anything is recorded", () => {
    expect(cachedVerification("token-a", 1000)).toBeUndefined();
  });

  it("returns the user id recorded for that exact token", () => {
    rememberVerification("token-a", "user-1", 1000);
    expect(cachedVerification("token-a", 1000)).toBe("user-1");
  });

  it("distinguishes 'no user' from 'not asked yet'", () => {
    // Both are falsy, and the caller must not confuse them: `null` means
    // Supabase was asked and said nobody, which is a real answer worth reusing.
    rememberVerification("token-a", null, 1000);
    expect(cachedVerification("token-a", 1000)).toBeNull();
    expect(cachedVerification("token-b", 1000)).toBeUndefined();
  });

  it("never answers for a different token", () => {
    // Signing out clears the cookie and a refresh rotates it, so a stale entry
    // cannot be reached by a later request — the key changed.
    rememberVerification("token-a", "user-1", 1000);
    expect(cachedVerification("token-b", 1000)).toBeUndefined();
  });

  it("expires, so revocation elsewhere is bounded", () => {
    rememberVerification("token-a", "user-1", 1000);
    expect(cachedVerification("token-a", 1000 + VERIFY_TTL_MS - 1)).toBe("user-1");
    expect(cachedVerification("token-a", 1000 + VERIFY_TTL_MS)).toBeUndefined();
  });

  it("covers a whole page load's burst", () => {
    // The thing this exists for: the navigation verifies, and the prefetches it
    // triggers land within the same second and must not each verify again.
    rememberVerification("token-a", "user-1", 0);
    for (let i = 0; i < 23; i++) {
      expect(cachedVerification("token-a", 900)).toBe("user-1");
    }
  });
});

describe("rememberVerification", () => {
  it("is bounded, so a long-lived process cannot grow one entry per token", () => {
    for (let i = 0; i < VERIFY_MAX_ENTRIES + 10; i++) {
      rememberVerification(`token-${i}`, `user-${i}`, 1000);
    }
    // The oldest are gone, the newest survive.
    expect(cachedVerification("token-0", 1000)).toBeUndefined();
    expect(cachedVerification(`token-${VERIFY_MAX_ENTRIES + 9}`, 1000)).toBe(
      `user-${VERIFY_MAX_ENTRIES + 9}`,
    );
  });

  it("evicts oldest-first rather than the entry just refreshed", () => {
    rememberVerification("keep", "user-keep", 1000);
    for (let i = 0; i < VERIFY_MAX_ENTRIES - 1; i++) {
      rememberVerification(`filler-${i}`, "u", 1000);
    }
    // Touch it again: it must move to the back of the eviction queue, or the
    // token in active use is the first one dropped under load.
    rememberVerification("keep", "user-keep", 1001);
    rememberVerification("overflow", "u", 1001);
    expect(cachedVerification("keep", 1001)).toBe("user-keep");
  });
});
