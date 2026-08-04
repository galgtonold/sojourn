import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

// What happens when a push does not go out.
//
// deliver() used to catch every error and act on exactly two of them (404 and
// 410, which mean the subscription is gone). Everything else — a network abort,
// an FCM 429, a 5xx, a malformed VAPID key — was discarded without a word. So
// when notifications went missing there was nothing to look at: no log, no
// row, no counter. That silence is most of why the real bug (work frozen with
// the response; see @/lib/after-response) went unexplained for so long.

const logged = vi.hoisted(() => ({ calls: [] as { scope: string; err: unknown }[] }));
const admin = vi.hoisted(() => ({ client: null as unknown }));
const outcome = vi.hoisted(() => ({
  // endpoint → what sendNotification should do
  byEndpoint: new Map<string, { statusCode?: number } | null>(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => admin.client }));
vi.mock("@/lib/log", () => ({
  logError: (scope: string, err: unknown) => logged.calls.push({ scope, err }),
}));
vi.mock("@/lib/env", () => ({
  isPushConfigured: true,
  env: {
    vapidSubject: "mailto:a@b.c",
    vapidPublicKey: "pub",
    vapidPrivateKey: "priv",
    siteUrl: "https://example.test",
  },
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn((sub: { endpoint: string }) => {
      const fail = outcome.byEndpoint.get(sub.endpoint);
      if (fail) return Promise.reject(Object.assign(new Error("push failed"), fail));
      return Promise.resolve();
    }),
  },
}));

import { notifyCommentAuthor } from "@/lib/notify";

function seed(endpoints: string[]) {
  return makeFakeSupabase({
    comments: [{ id: "c1", post_id: "p1", visitor_token: "owner" }],
    posts: [{ id: "p1", slug: "s", source_locale: "en" }],
    push_subscriptions: endpoints.map((e, i) => ({
      id: `s${i + 1}`,
      endpoint: e,
      p256dh: "x",
      auth: "y",
      audience: "viewer",
      visitor_token: "owner",
    })),
  });
}

beforeEach(() => {
  logged.calls = [];
  outcome.byEndpoint = new Map();
});

describe("push delivery failures", () => {
  it("prunes a subscription the push service says is gone (410)", async () => {
    admin.client = seed(["https://fcm.googleapis.com/fcm/send/DEAD"]);
    outcome.byEndpoint.set("https://fcm.googleapis.com/fcm/send/DEAD", { statusCode: 410 });

    await notifyCommentAuthor("c1", "someone", { kind: "like" });

    expect((admin.client as FakeSupabase).store.push_subscriptions).toHaveLength(0);
  });

  it("reports a failure that is not the subscription being gone", async () => {
    admin.client = seed(["https://fcm.googleapis.com/fcm/send/BUSY"]);
    outcome.byEndpoint.set("https://fcm.googleapis.com/fcm/send/BUSY", { statusCode: 429 });

    await notifyCommentAuthor("c1", "someone", { kind: "like" });

    // The row must survive — a 429 is "try later", not "this device is gone".
    expect((admin.client as FakeSupabase).store.push_subscriptions).toHaveLength(1);
    // And it must leave a trace, which is the part that did not exist.
    expect(logged.calls).toHaveLength(1);
    expect(logged.calls[0].scope).toBe("push.send");
  });

  it("does not name the endpoint in the log", async () => {
    // A push endpoint is a capability URL: whoever holds it, plus our VAPID
    // key, can push to that device. It does not belong in a log line.
    const endpoint = "https://fcm.googleapis.com/fcm/send/SECRET-TOKEN-abc123";
    admin.client = seed([endpoint]);
    outcome.byEndpoint.set(endpoint, { statusCode: 500 });

    await notifyCommentAuthor("c1", "someone", { kind: "like" });

    const line = JSON.stringify(logged.calls[0]);
    expect(line).not.toContain("SECRET-TOKEN-abc123");
    expect(line).toContain("fcm.googleapis.com"); // the useful half is kept
  });

  it("one dead subscription does not stop the others", async () => {
    admin.client = seed([
      "https://fcm.googleapis.com/fcm/send/DEAD",
      "https://fcm.googleapis.com/fcm/send/OK",
    ]);
    outcome.byEndpoint.set("https://fcm.googleapis.com/fcm/send/DEAD", { statusCode: 500 });

    await notifyCommentAuthor("c1", "someone", { kind: "like" });

    // The healthy one still got its push, and the failure was reported once.
    expect(logged.calls).toHaveLength(1);
    expect((admin.client as FakeSupabase).store.push_subscriptions).toHaveLength(2);
  });
});
