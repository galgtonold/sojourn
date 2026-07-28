import { describe, it, expect, vi, beforeEach } from "vitest";

const adm = vi.hoisted(() => ({ client: null as unknown }));
const rl = vi.hoisted(() => ({ allow: true }));
const win = vi.hoisted(() => ({ state: "open" as "open" | "expired" }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => adm.client }));
// Keep the real owner lookup (it drives most of these cases); only the clock
// is stubbed, so the window can be moved without touching timers.
vi.mock("@/lib/setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/setup")>()),
  getClaimWindow: () => Promise.resolve(win.state),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => rl.allow,
  clientIp: () => "1.1.1.1",
}));

import { POST } from "@/app/api/setup/route";

type Result = { data: unknown; error: unknown };

/**
 * Hand-rolled admin mock: the shared fake-supabase has no `auth.admin`, and the
 * route needs error injection (unique violations, email collisions) it can't
 * express. Only `profiles` is ever queried, so one chain shape covers all uses:
 * awaiting the chain resolves the owner-existence query; `.maybeSingle()`
 * resolves the by-email profile lookup; `.upsert()` records the promote.
 */
function makeAdmin(cfg: {
  owners?: Result;
  profileByEmail?: { id: string } | null;
  createUserError?: { code?: string; message?: string } | null;
  upsertError?: { code?: string; message?: string } | null;
} = {}) {
  const calls = {
    createUser: [] as Record<string, unknown>[],
    updateUserById: [] as [string, Record<string, unknown>][],
    deleteUser: [] as string[],
    upserts: [] as Record<string, unknown>[],
    cleared: [] as string[],
  };
  const ownerResult: Result = cfg.owners ?? { data: [], error: null };
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "ilike", "limit", "neq"]) q[m] = () => q;
      q.delete = () => {
        calls.cleared.push(table);
        return q;
      };
      q.maybeSingle = async () => ({
        data: cfg.profileByEmail ?? null,
        error: null,
      });
      q.upsert = (row: Record<string, unknown>) => {
        calls.upserts.push(row);
        return Promise.resolve({ data: null, error: cfg.upsertError ?? null });
      };
      q.then = (res: (v: Result) => unknown) =>
        Promise.resolve(ownerResult).then(res);
      return q;
    },
    auth: {
      admin: {
        async createUser(attrs: Record<string, unknown>) {
          calls.createUser.push(attrs);
          if (cfg.createUserError) {
            return { data: { user: null }, error: cfg.createUserError };
          }
          return { data: { user: { id: "new-user-1" } }, error: null };
        },
        async updateUserById(id: string, attrs: Record<string, unknown>) {
          calls.updateUserById.push([id, attrs]);
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id: string) {
          calls.deleteUser.push(id);
          return { data: {}, error: null };
        },
      },
    },
  };
  return { admin, calls };
}

function call(body: unknown) {
  return POST(
    new Request("http://t/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const good = { email: "phil@example.com", password: "hunter2hunter2" };

beforeEach(() => {
  adm.client = null;
  rl.allow = true;
  win.state = "open";
});

describe("POST /api/setup", () => {
  it("503s when the service role is not configured", async () => {
    const res = await call(good);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("unconfigured");
  });

  it("429s when rate-limited", async () => {
    rl.allow = false;
    adm.client = makeAdmin().admin;
    const res = await call(good);
    expect(res.status).toBe(429);
  });

  it("400s on an invalid email", async () => {
    adm.client = makeAdmin().admin;
    const res = await call({ email: "not-an-email", password: good.password });
    expect(res.status).toBe(400);
  });

  it("400s on a too-short password", async () => {
    adm.client = makeAdmin().admin;
    const res = await call({ email: good.email, password: "short" });
    expect(res.status).toBe(400);
  });

  it("410s without touching auth once an owner exists", async () => {
    const { admin, calls } = makeAdmin({
      owners: { data: [{ id: "u1" }], error: null },
    });
    adm.client = admin;
    const res = await call(good);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("owner-exists");
    expect(calls.createUser).toHaveLength(0);
  });

  it("refuses once the claim window has expired, without creating anything", async () => {
    win.state = "expired";
    const { admin, calls } = makeAdmin();
    adm.client = admin;
    const res = await call(good);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("setup-window-expired");
    expect(calls.createUser).toHaveLength(0);
  });

  it("reports the install as already claimed before it reports it as expired", async () => {
    // An owner exists AND the window lapsed: the useful answer is "claimed".
    win.state = "expired";
    const { admin } = makeAdmin({ owners: { data: [{ id: "u1" }], error: null } });
    adm.client = admin;
    expect((await call(good)).status).toBe(410);
  });

  it("clears inherited AI provider config when claiming", async () => {
    const { admin, calls } = makeAdmin();
    adm.client = admin;
    await call(good);
    expect(calls.cleared).toContain("app_secrets");
  });

  it("creates a confirmed owner account and promotes its profile", async () => {
    const { admin, calls } = makeAdmin();
    adm.client = admin;
    const res = await call({
      email: "  Phil@Example.COM ",
      password: good.password,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(calls.createUser).toEqual([
      {
        email: "phil@example.com",
        password: good.password,
        email_confirm: true,
      },
    ]);
    expect(calls.upserts).toEqual([
      { id: "new-user-1", email: "phil@example.com", role: "owner" },
    ]);
  });

  it("cleans up the created user and 410s when it loses the claim race", async () => {
    const { admin, calls } = makeAdmin({
      upsertError: { code: "23505", message: "duplicate key" },
    });
    adm.client = admin;
    const res = await call(good);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("owner-exists");
    expect(calls.deleteUser).toEqual(["new-user-1"]);
  });

  it("recovers a crash-mid-setup account: resets its password and promotes it", async () => {
    const { admin, calls } = makeAdmin({
      createUserError: { code: "email_exists", message: "already registered" },
      profileByEmail: { id: "member-9" },
    });
    adm.client = admin;
    const res = await call(good);
    expect(res.status).toBe(200);
    expect(calls.updateUserById).toEqual([
      ["member-9", { password: good.password, email_confirm: true }],
    ]);
    expect(calls.upserts).toEqual([
      { id: "member-9", email: good.email, role: "owner" },
    ]);
    expect(calls.deleteUser).toHaveLength(0);
  });

  it("409s when the email exists but no profile can be found", async () => {
    const { admin } = makeAdmin({
      createUserError: { code: "email_exists", message: "already registered" },
      profileByEmail: null,
    });
    adm.client = admin;
    const res = await call(good);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email-taken");
  });

  it("500s on an unexpected create failure", async () => {
    const { admin } = makeAdmin({
      createUserError: { message: "database unavailable" },
    });
    adm.client = admin;
    const res = await call(good);
    expect(res.status).toBe(500);
  });
});
