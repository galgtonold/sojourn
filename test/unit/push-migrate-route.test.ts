import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

// Subscription rotation.
//
// Chrome rotates a push subscription from time to time, and revokes one when
// the user clears site data. The browser tells the service worker by firing
// `pushsubscriptionchange`; if nobody listens, the endpoint we stored keeps
// answering 410 and that device silently stops receiving anything. The reader
// experiences it as "notifications worked for a while and then just stopped",
// and nothing on the server distinguishes it from a quiet week.
//
// The service worker cannot rebuild the record on its own: audience, user_id
// and visitor_token live in localStorage or a session, and a worker has
// neither. So it says only "this endpoint became that endpoint", and the
// server carries the record across. That also makes the endpoint safe by
// construction — the caller cannot ASK for a subscription, only move one that
// already exists, so there is no way to mint an admin subscription here.

const admin = vi.hoisted(() => ({ client: null as unknown }));
const limit = vi.hoisted(() => ({ allow: true }));

vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => admin.client }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(limit.allow),
  clientIp: () => "1.1.1.1",
  limitFor: (_r: unknown, l: number) => ({ ip: "1.1.1.1", limit: l }),
}));

import { POST } from "@/app/api/push/migrate/route";

const OLD = "https://fcm.googleapis.com/fcm/send/OLD-endpoint-aaa";
const NEW = "https://fcm.googleapis.com/fcm/send/NEW-endpoint-bbb";

function call(body: unknown) {
  return POST(
    new Request("http://t/api/push/migrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function seed() {
  return makeFakeSupabase({
    push_subscriptions: [
      {
        id: "s-admin",
        endpoint: OLD,
        p256dh: "old-p",
        auth: "old-a",
        audience: "admin",
        user_id: "user-42",
        visitor_token: null,
      },
      {
        id: "s-viewer",
        endpoint: "https://fcm.googleapis.com/fcm/send/VIEWER",
        p256dh: "v-p",
        auth: "v-a",
        audience: "viewer",
        user_id: null,
        visitor_token: "tok-reader-1",
      },
    ],
  });
}

beforeEach(() => {
  admin.client = seed();
  limit.allow = true;
});

describe("POST /api/push/migrate", () => {
  it("moves the subscription to the new endpoint, keeping who it belongs to", async () => {
    const res = await call({ oldEndpoint: OLD, endpoint: NEW, keys: { p256dh: "new-p", auth: "new-a" } });
    expect(res.status).toBe(200);

    const rows = (admin.client as FakeSupabase).store.push_subscriptions;
    const moved = rows.find((r) => r.endpoint === NEW);
    expect(moved).toBeTruthy();
    expect(moved!.audience).toBe("admin");
    expect(moved!.user_id).toBe("user-42"); // still the same admin
    expect(moved!.p256dh).toBe("new-p"); // new crypto keys took effect
    expect(moved!.auth).toBe("new-a");

    // The dead endpoint must not linger, or every send keeps paying for a 410.
    expect(rows.find((r) => r.endpoint === OLD)).toBeUndefined();
    expect(rows).toHaveLength(2); // moved, not duplicated
  });

  it("keeps a reader's visitor_token, which is how replies find them", async () => {
    await call({
      oldEndpoint: "https://fcm.googleapis.com/fcm/send/VIEWER",
      endpoint: NEW,
      keys: { p256dh: "n", auth: "n" },
    });
    const moved = (admin.client as FakeSupabase).store.push_subscriptions.find(
      (r) => r.endpoint === NEW,
    );
    expect(moved!.audience).toBe("viewer");
    expect(moved!.visitor_token).toBe("tok-reader-1");
  });

  it("refuses an unknown old endpoint, and creates nothing", async () => {
    // The security property. If this minted a row, anyone could POST an
    // arbitrary endpoint and start receiving the owner's comment alerts.
    const res = await call({
      oldEndpoint: "https://fcm.googleapis.com/fcm/send/NEVER-EXISTED",
      endpoint: NEW,
      keys: { p256dh: "n", auth: "n" },
    });
    expect(res.status).toBe(404);
    const rows = (admin.client as FakeSupabase).store.push_subscriptions;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.endpoint === NEW)).toBeUndefined();
  });

  it("cannot be talked into promoting a reader to admin", async () => {
    // Audience is inherited from the stored row; anything the caller sends is
    // ignored. There is deliberately no audience field in the schema.
    await call({
      oldEndpoint: "https://fcm.googleapis.com/fcm/send/VIEWER",
      endpoint: NEW,
      keys: { p256dh: "n", auth: "n" },
      audience: "admin",
      user_id: "user-42",
    });
    const moved = (admin.client as FakeSupabase).store.push_subscriptions.find(
      (r) => r.endpoint === NEW,
    );
    expect(moved!.audience).toBe("viewer");
    expect(moved!.user_id).toBeNull();
  });

  it("applies the same endpoint allowlist as subscribing", async () => {
    // Otherwise this is a hole straight past the SSRF guard on /api/push: the
    // sender POSTs to whatever is stored here, from inside our network.
    const res = await call({
      oldEndpoint: OLD,
      endpoint: "http://169.254.169.254/latest/meta-data/",
      keys: { p256dh: "n", auth: "n" },
    });
    expect(res.status).toBe(400);
    const rows = (admin.client as FakeSupabase).store.push_subscriptions;
    expect(rows.find((r) => r.endpoint === OLD)).toBeTruthy(); // untouched
  });

  it("is rate limited", async () => {
    limit.allow = false;
    const res = await call({ oldEndpoint: OLD, endpoint: NEW, keys: { p256dh: "n", auth: "n" } });
    expect(res.status).toBe(429);
  });

  it("rejects a malformed body without touching anything", async () => {
    const res = await call({ oldEndpoint: OLD });
    expect(res.status).toBe(400);
    expect((admin.client as FakeSupabase).store.push_subscriptions).toHaveLength(2);
  });
});
