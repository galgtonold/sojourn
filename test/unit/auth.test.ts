import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => sb.client,
}));

import { getViewer } from "@/lib/auth";

describe("getViewer", () => {
  beforeEach(() => {
    sb.client = null;
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
