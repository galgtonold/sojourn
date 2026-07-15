// The settings route is the only writer of app_secrets and the only thing that
// reports config state to the browser. Two properties matter most: the owner
// gate, and that a secret VALUE never appears in a response.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireOwnerMock, getAdminMock } = vi.hoisted(() => ({
  requireOwnerMock: vi.fn(),
  getAdminMock: vi.fn(),
}));
vi.mock("@/lib/api/admin-auth", () => ({ requireOwner: requireOwnerMock }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: getAdminMock }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

import { GET, PUT, DELETE } from "@/app/api/admin/settings/ai/route";

const req = (method: string, body?: unknown) =>
  new Request("http://x/api/admin/settings/ai", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = () => ({ params: Promise.resolve({}) });

/** Minimal service-role client: select().in() resolves to `rows`, and
 *  upsert/delete record their calls. */
function fakeAdmin(rows: { key: string; value: string }[] = []) {
  const calls = { upsert: [] as unknown[], deleted: [] as unknown[] };
  return {
    calls,
    from: () => ({
      select: () => ({ in: async () => ({ data: rows, error: null }) }),
      upsert: async (v: unknown) => {
        calls.upsert.push(v);
        return { error: null };
      },
      delete: () => ({
        in: async (_c: string, keys: unknown) => {
          calls.deleted.push(keys);
          return { error: null };
        },
      }),
    }),
  };
}

beforeEach(() => {
  requireOwnerMock.mockReset();
  getAdminMock.mockReset();
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
});

describe("GET /api/admin/settings/ai", () => {
  it("403s a non-owner", async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403 });
    expect((await GET()).status).toBe(403);
  });

  it("never returns a secret value, only a mask", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(fakeAdmin([{ key: "deepseekApiKey", value: "sk-supersecret9999" }]));
    const res = await GET();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("sk-supersecret9999");
    expect(body.fields.deepseekApiKey.value).toBe("");
    expect(body.fields.deepseekApiKey.masked).toBe("…9999");
    expect(body.fields.deepseekApiKey.source).toBe("db");
  });

  it("returns non-secret values in the clear with their source", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(fakeAdmin([{ key: "deepseekBaseUrl", value: "https://db.example" }]));
    const body = await (await GET()).json();
    expect(body.fields.deepseekBaseUrl.value).toBe("https://db.example");
    expect(body.fields.deepseekBaseUrl.source).toBe("db");
  });

  it("reports env as the source when only env has the field", async () => {
    process.env.DEEPSEEK_BASE_URL = "https://env.example";
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(fakeAdmin([]));
    const body = await (await GET()).json();
    expect(body.fields.deepseekBaseUrl.source).toBe("env");
    expect(body.fields.deepseekBaseUrl.value).toBe("https://env.example");
  });
});

describe("PUT /api/admin/settings/ai", () => {
  it("403s a non-owner without touching the client", async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403 });
    expect((await PUT(req("PUT", { values: { deepseekApiKey: "k" } }), ctx())).status).toBe(403);
    expect(getAdminMock).not.toHaveBeenCalled();
  });

  it("400s an unknown field", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(fakeAdmin());
    const res = await PUT(req("PUT", { values: { supabaseServiceRoleKey: "nope" } }), ctx());
    expect(res.status).toBe(400);
  });

  it("upserts the given fields with updated_by", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    const admin = fakeAdmin();
    getAdminMock.mockReturnValue(admin);
    const res = await PUT(req("PUT", { values: { deepseekApiKey: "  sk-x  " } }), ctx());
    expect(res.status).toBe(200);
    expect(admin.calls.upsert[0]).toEqual([
      { key: "deepseekApiKey", value: "sk-x", updated_by: "u1" },
    ]);
  });

  it("400s an empty payload rather than writing nothing", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(fakeAdmin());
    expect((await PUT(req("PUT", { values: {} }), ctx())).status).toBe(400);
  });
});

describe("DELETE /api/admin/settings/ai", () => {
  it("clears the named keys so they fall back to env", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    const admin = fakeAdmin();
    getAdminMock.mockReturnValue(admin);
    const res = await DELETE(req("DELETE", { keys: ["deepseekApiKey"] }), ctx());
    expect(res.status).toBe(200);
    expect(admin.calls.deleted[0]).toEqual(["deepseekApiKey"]);
  });

  it("400s an unknown key", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(fakeAdmin());
    expect((await DELETE(req("DELETE", { keys: ["nope"] }), ctx())).status).toBe(400);
  });
});
