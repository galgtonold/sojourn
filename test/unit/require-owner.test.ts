import { describe, it, expect, vi, beforeEach } from "vitest";

// The gate between a collaborator and `auth.admin.deleteUser`, the backup export
// of the entire database, and the AI provider secrets — with zero coverage.
//
// Every test that touched it mocked it away, so none of its four outcomes had
// ever been executed. That includes the demo-mode branch, which the module's own
// comment describes as the second line of defence protecting the showcase
// deployment "even if the middleware matcher is edited carelessly later" — a
// claim nothing checked.

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  demo: false,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return { demoMode: auth.demo };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: auth.role === null ? null : { role: auth.role },
          }),
        }),
      }),
    }),
  }),
}));

import { requireOwner } from "@/lib/api/admin-auth";

beforeEach(() => {
  auth.user = { id: "user-owner" };
  auth.role = "owner";
  auth.demo = false;
});

describe("requireOwner", () => {
  it("admits the site owner and returns their id", async () => {
    const gate = await requireOwner();
    expect(gate).toEqual({ ok: true, self: "user-owner" });
  });

  it("refuses an anonymous caller with 401", async () => {
    auth.user = null;
    expect(await requireOwner()).toEqual({ ok: false, status: 401 });
  });

  it("refuses a collaborator with 403", async () => {
    // A member is signed in and has a profile — the distinction this gate
    // exists to draw, and the one a bare session check misses.
    auth.role = "member";
    expect(await requireOwner()).toEqual({ ok: false, status: 403 });
  });

  it("refuses a session with no profile row at all", async () => {
    auth.role = null;
    expect(await requireOwner()).toEqual({ ok: false, status: 403 });
  });

  it("refuses everyone in demo mode, including the owner", async () => {
    // The documented second line of defence. Asserted with a valid owner so the
    // check cannot pass for any other reason.
    auth.demo = true;
    auth.role = "owner";
    expect(await requireOwner()).toEqual({ ok: false, status: 403 });
  });

  it("checks demo mode before it even looks for a session", async () => {
    // The point of ordering it first: on the showcase deployment the gate must
    // hold whether or not anyone is signed in, and without depending on the
    // middleware matcher still covering the route.
    auth.demo = true;
    auth.user = null;
    expect(await requireOwner()).toEqual({ ok: false, status: 403 });
  });
});
