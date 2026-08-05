import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

// Does the server still know about this browser's subscription?
//
// getPushState() answers "subscribed" from the browser's own PushManager and
// never asks the server, so the switch reads ON while the stored row may be
// gone — pruned after a 410, or rotated away. That is the "I toggled it and
// then it worked again" experience: toggling is the only thing that ever
// re-registers, and nothing else notices the row is missing.
//
// This route is deliberately READ-ONLY about ownership. It reports whether the
// endpoint is known and what audience it holds; it never creates a row and
// never changes one. That matters because the header bell renders on every
// page including /admin, and a refresh that carried an audience would let a
// public page quietly demote the owner's admin subscription to viewer.

const admin = vi.hoisted(() => ({ client: null as unknown }));
const limit = vi.hoisted(() => ({ allow: true }));

vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => admin.client }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(limit.allow),
  clientIp: () => "1.1.1.1",
}));

import { POST } from "@/app/api/push/refresh/route";

const ADMIN_EP = "https://fcm.googleapis.com/fcm/send/ADMIN";
const VIEWER_EP = "https://fcm.googleapis.com/fcm/send/VIEWER";

function call(body: unknown) {
  return POST(
    new Request("http://t/api/push/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  limit.allow = true;
  admin.client = makeFakeSupabase({
    push_subscriptions: [
      { id: "s-admin", endpoint: ADMIN_EP, audience: "admin", user_id: "user-42", visitor_token: null },
      { id: "s-viewer", endpoint: VIEWER_EP, audience: "viewer", user_id: null, visitor_token: "tok-reader" },
    ],
  });
});

describe("POST /api/push/refresh", () => {
  it("says the subscription is known, and what it is", async () => {
    const res = await call({ endpoint: ADMIN_EP });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ known: true, audience: "admin" });
  });

  it("says when the server has lost it", async () => {
    const res = await call({ endpoint: "https://fcm.googleapis.com/fcm/send/GONE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ known: false });
  });

  it("creates nothing for an unknown endpoint", async () => {
    await call({ endpoint: "https://fcm.googleapis.com/fcm/send/GONE" });
    const rows = (admin.client as FakeSupabase).store.push_subscriptions;
    expect(rows).toHaveLength(2);
  });

  it("cannot change an audience, whatever the caller sends", async () => {
    // The whole reason this route exists separately from /api/push. The bell
    // is in the root layout, so it mounts on /admin too; if a refresh could
    // carry an audience, loading an admin page would demote the owner.
    await call({ endpoint: ADMIN_EP, audience: "viewer", user_id: null });
    const row = (admin.client as FakeSupabase).store.push_subscriptions.find(
      (r) => r.endpoint === ADMIN_EP,
    );
    expect(row!.audience).toBe("admin");
    expect(row!.user_id).toBe("user-42");
  });

  it("leaves a reader's row exactly as it was", async () => {
    await call({ endpoint: VIEWER_EP });
    const row = (admin.client as FakeSupabase).store.push_subscriptions.find(
      (r) => r.endpoint === VIEWER_EP,
    );
    expect(row!.audience).toBe("viewer");
    expect(row!.visitor_token).toBe("tok-reader");
  });

  it("is rate limited", async () => {
    limit.allow = false;
    expect((await call({ endpoint: ADMIN_EP })).status).toBe(429);
  });

  it("rejects a malformed body", async () => {
    expect((await call({})).status).toBe(400);
  });
});
