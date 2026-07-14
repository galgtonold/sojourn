import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { NextResponse } from "next/server";

const { requireOwnerMock, getAdminMock } = vi.hoisted(() => ({
  requireOwnerMock: vi.fn(),
  getAdminMock: vi.fn(),
}));
vi.mock("@/lib/api/admin-auth", () => ({ requireOwner: requireOwnerMock }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: getAdminMock }));

import { ownerRoute } from "@/lib/api/owner-route";

const post = (body?: unknown) =>
  new Request("http://x/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
});

beforeEach(() => {
  requireOwnerMock.mockReset();
  getAdminMock.mockReset();
});

describe("ownerRoute", () => {
  const schema = z.object({ name: z.string() });

  it("returns the gate status (401/403) without touching the client or handler", async () => {
    const handler = vi.fn();
    requireOwnerMock.mockResolvedValue({ ok: false, status: 401 });
    expect((await ownerRoute(schema, handler)(post({ name: "x" }), ctx())).status).toBe(401);
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403 });
    expect((await ownerRoute(schema, handler)(post({ name: "x" }), ctx())).status).toBe(403);
    expect(getAdminMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("503 when the service role isn't configured", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue(null);
    expect((await ownerRoute(schema, vi.fn())(post({ name: "x" }), ctx())).status).toBe(503);
  });

  it("400 on an invalid body, without running the handler", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue({});
    const handler = vi.fn();
    expect((await ownerRoute(schema, handler)(post({ nope: 1 }), ctx())).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler with admin/self/input/params and wraps the value in 200", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    const admin = { tag: "admin" };
    getAdminMock.mockReturnValue(admin);
    const handler = vi.fn(
      async (c: {
        admin: unknown;
        self: string;
        input: { name: string };
        params: Record<string, string>;
      }) => ({ got: c.input.name, self: c.self, id: c.params.id }),
    );
    const res = await ownerRoute(schema, handler)(post({ name: "hi" }), ctx({ id: "42" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: "hi", self: "u1", id: "42" });
    expect(handler.mock.calls[0][0].admin).toBe(admin);
  });

  it("passes a returned Response through unchanged", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue({});
    const res = await ownerRoute(z.unknown(), async () =>
      NextResponse.json({ error: "nope" }, { status: 404 }),
    )(post({}), ctx());
    expect(res.status).toBe(404);
  });

  it("maps a thrown handler error to 502", async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, self: "u1" });
    getAdminMock.mockReturnValue({});
    const res = await ownerRoute(z.unknown(), async () => {
      throw new Error("boom");
    })(post({}), ctx());
    expect(res.status).toBe(502);
  });
});
