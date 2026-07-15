import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => sb.client,
}));

// A fixed, non-empty key so signViewer/verifyViewer round-trip deterministically
// in tests — it never touches the real service role key.
const TEST_SERVICE_ROLE_KEY = vi.hoisted(
  () => "test-service-role-key-for-auth-unit-tests",
);
vi.mock("@/lib/env", () => ({
  env: { supabaseServiceRoleKey: TEST_SERVICE_ROLE_KEY },
}));

// getViewer's forwarded fast path reads headers() directly; outside a real
// request scope (which is all vitest offers) that throws, so this is the only
// way to exercise the fast path at all rather than only ever hitting its catch.
const fwd = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => fwd.headers,
}));

import { getViewer } from "@/lib/auth";
import { VIEWER_HEADER, VIEWER_TTL_MS, signViewer } from "@/lib/auth-forward";

describe("getViewer", () => {
  beforeEach(() => {
    sb.client = null;
    // No forwarded header by default: every pre-existing test below must keep
    // exercising the fallback exactly as it did before the fast path existed.
    fwd.headers = new Headers();
  });

  it("returns an empty viewer without a backend", async () => {
    expect(await getViewer()).toEqual({
      userId: null,
      email: null,
      isOwner: false,
      tripIds: [],
    });
  });

  it("returns an empty viewer when nobody is signed in", async () => {
    const c = makeFakeSupabase({ profiles: [] });
    c.auth.getUser = async () => ({ data: { user: null }, error: null }) as any;
    sb.client = c;
    expect((await getViewer()).isOwner).toBe(false);
    expect((await getViewer()).userId).toBeNull();
  });

  it("recognizes the owner (no per-trip restriction)", async () => {
    const c = makeFakeSupabase({
      profiles: [{ id: "user-1", role: "owner" }],
      trip_members: [{ user_id: "user-1", trip_id: "t1" }],
    });
    c.auth.getUser = async () => ({
      data: { user: { id: "user-1", email: "owner@x.test" } },
      error: null,
    }) as any;
    sb.client = c;
    const v = await getViewer();
    expect(v).toMatchObject({
      userId: "user-1",
      email: "owner@x.test",
      isOwner: true,
      tripIds: [], // owner edits everything; no explicit list
    });
  });

  it("collects granted trip ids for a member", async () => {
    const c = makeFakeSupabase({
      profiles: [{ id: "user-2", role: "member" }],
      trip_members: [
        { user_id: "user-2", trip_id: "t1" },
        { user_id: "user-2", trip_id: "t2" },
        { user_id: "other", trip_id: "t9" },
      ],
    });
    c.auth.getUser = async () => ({
      data: { user: { id: "user-2", email: "m@x.test" } },
      error: null,
    }) as any;
    sb.client = c;
    const v = await getViewer();
    expect(v.isOwner).toBe(false);
    expect(v.tripIds.sort()).toEqual(["t1", "t2"]);
  });
});

// The suite above proves the fallback. Under vitest, headers() throws outside a
// request scope, which is why every test above only ever hit forwardedUserId's
// catch — none of it says anything about the fast path middleware forwards a
// verified id through. These mock next/headers directly so the fast path is
// actually reachable and can be asserted on, not just assumed from code review.
describe("getViewer — forwarded fast path", () => {
  beforeEach(() => {
    sb.client = null;
    fwd.headers = new Headers();
  });

  async function header(userId: string): Promise<string> {
    const signed = await signViewer(userId, TEST_SERVICE_ROLE_KEY, Date.now());
    if (!signed) throw new Error("test setup: signViewer returned null");
    return signed;
  }

  it("is actually taken: a valid signed header resolves the viewer without auth.getUser()", async () => {
    const c = makeFakeSupabase(
      {
        profiles: [{ id: "user-fast", role: "member", email: "fast@x.test" }],
        trip_members: [{ user_id: "user-fast", trip_id: "t1" }],
      },
      "user-fast",
    );
    const getUserSpy = vi.fn(async () => ({ data: { user: null }, error: null }));
    c.auth.getUser = getUserSpy as any;
    sb.client = c;
    fwd.headers = new Headers({ [VIEWER_HEADER]: await header("user-fast") });

    const v = await getViewer();

    // This is the assertion that proves the round trip is actually saved —
    // without it, a broken fast path that silently degrades to the fallback
    // every time would pass every other test in this file unnoticed.
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(v.userId).toBe("user-fast");
  });

  it("sources Viewer.email from profiles on the fast path (no auth record to read it from)", async () => {
    const c = makeFakeSupabase(
      { profiles: [{ id: "user-fast", role: "member", email: "fast@x.test" }] },
      "user-fast",
    );
    c.auth.getUser = (async () => ({ data: { user: null }, error: null })) as any;
    sb.client = c;
    fwd.headers = new Headers({ [VIEWER_HEADER]: await header("user-fast") });

    expect((await getViewer()).email).toBe("fast@x.test");
  });

  it("resolves the owner correctly via the forwarded id (no per-trip restriction)", async () => {
    const c = makeFakeSupabase({
      profiles: [{ id: "user-1", role: "owner", email: "owner@x.test" }],
      trip_members: [{ user_id: "user-1", trip_id: "t1" }],
    });
    c.auth.getUser = (async () => ({ data: { user: null }, error: null })) as any;
    sb.client = c;
    fwd.headers = new Headers({ [VIEWER_HEADER]: await header("user-1") });

    const v = await getViewer();
    expect(v.isOwner).toBe(true);
    expect(v.tripIds).toEqual([]);
  });

  it("collects granted trip ids for a member via the forwarded id", async () => {
    const c = makeFakeSupabase({
      profiles: [{ id: "user-2", role: "member", email: "m@x.test" }],
      trip_members: [
        { user_id: "user-2", trip_id: "t1" },
        { user_id: "user-2", trip_id: "t2" },
        { user_id: "other", trip_id: "t9" },
      ],
    });
    c.auth.getUser = (async () => ({ data: { user: null }, error: null })) as any;
    sb.client = c;
    fwd.headers = new Headers({ [VIEWER_HEADER]: await header("user-2") });

    const v = await getViewer();
    expect(v.isOwner).toBe(false);
    expect(v.tripIds.sort()).toEqual(["t1", "t2"]);
  });

  it("falls back to auth.getUser() when the header's signature is forged", async () => {
    const c = makeFakeSupabase({
      profiles: [{ id: "user-1", role: "owner", email: "owner@x.test" }],
    });
    const getUserSpy = vi.fn(async () => ({
      data: { user: { id: "user-1", email: "owner@x.test" } },
      error: null,
    }));
    c.auth.getUser = getUserSpy as any;
    sb.client = c;
    // Same shape a genuine token has (uid.expiry.64-hex-char-sig), but the
    // signature was never produced by signViewer with the real key.
    const farFuture = Date.now() + VIEWER_TTL_MS;
    fwd.headers = new Headers({
      [VIEWER_HEADER]: `user-1.${farFuture}.${"a".repeat(64)}`,
    });

    const v = await getViewer();

    // The security property THE RULE requires, now covered at the getViewer
    // layer: a bad signature must degrade to the full verification path, never
    // be treated as "no user" and never be trusted as-is.
    expect(getUserSpy).toHaveBeenCalledTimes(1);
    expect(v.userId).toBe("user-1");
    expect(v.isOwner).toBe(true);
  });
});
