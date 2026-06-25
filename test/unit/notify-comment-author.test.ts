import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const admin = vi.hoisted(() => ({ client: null as unknown }));
const sent = vi.hoisted(() => ({ calls: [] as { endpoint: string; body: string }[] }));

vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => admin.client }));
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
    sendNotification: vi.fn((sub: { endpoint: string }, body: string) => {
      sent.calls.push({ endpoint: sub.endpoint, body });
      return Promise.resolve();
    }),
  },
}));

import { notifyCommentAuthor } from "@/lib/notify";

function seed() {
  return makeFakeSupabase({
    comments: [
      { id: "c1", post_id: "p1", visitor_token: "owner" },
      { id: "c2", post_id: "p1", visitor_token: null },
    ],
    posts: [{ id: "p1", slug: "tag-an-der-mosel", source_locale: "de" }],
    push_subscriptions: [
      { id: "s1", endpoint: "e1", p256dh: "x", auth: "y", audience: "viewer", visitor_token: "owner" },
      { id: "s2", endpoint: "e2", p256dh: "x", auth: "y", audience: "viewer", visitor_token: "other" },
      { id: "s3", endpoint: "e3", p256dh: "x", auth: "y", audience: "admin", visitor_token: "owner" },
    ],
  });
}

beforeEach(() => { sent.calls = []; });

describe("notifyCommentAuthor", () => {
  it("pushes only the owner's viewer subscription, with a deep link", async () => {
    admin.client = seed();
    await notifyCommentAuthor("c1", "replier", { kind: "reply", actorName: "Bob", bodyExcerpt: "schön!" });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0].endpoint).toBe("e1"); // not the other viewer (e2), not admin (e3)
    const payload = JSON.parse(sent.calls[0].body);
    expect(payload.url).toBe("https://example.test/posts/tag-an-der-mosel#comment-c1");
    expect(payload.title).toContain("Bob");
    expect(payload.title).toContain("hat auf deinen Kommentar geantwortet");
  });

  it("does not notify the actor for their own comment (self-reply/self-like)", async () => {
    admin.client = seed();
    await notifyCommentAuthor("c1", "owner", { kind: "like" });
    expect(sent.calls).toHaveLength(0);
  });

  it("no-ops when the comment has no owner token", async () => {
    admin.client = seed();
    await notifyCommentAuthor("c2", "x", { kind: "like" });
    expect(sent.calls).toHaveLength(0);
  });

  it("no-ops when the owner has no viewer subscription", async () => {
    const db = makeFakeSupabase({
      comments: [{ id: "c9", post_id: "p1", visitor_token: "lonely" }],
      posts: [{ id: "p1", slug: "s", source_locale: "en" }],
      push_subscriptions: [],
    });
    admin.client = db;
    await notifyCommentAuthor("c9", "x", { kind: "reply" });
    expect(sent.calls).toHaveLength(0);
  });

  it("no-ops when the admin client is unconfigured", async () => {
    admin.client = null;
    await expect(notifyCommentAuthor("c1", "x", { kind: "like" })).resolves.toBeUndefined();
    expect(sent.calls).toHaveLength(0);
  });

  it("defaults to an English title when source_locale is null", async () => {
    admin.client = makeFakeSupabase({
      comments: [{ id: "c1", post_id: "p1", visitor_token: "owner" }],
      posts: [{ id: "p1", slug: "s", source_locale: null }],
      push_subscriptions: [
        { id: "s1", endpoint: "e1", p256dh: "x", auth: "y", audience: "viewer", visitor_token: "owner" },
      ],
    });
    await notifyCommentAuthor("c1", "replier", { kind: "reply", actorName: "Bob" });
    expect(sent.calls).toHaveLength(1);
    expect(JSON.parse(sent.calls[0].body).title).toContain("replied to your comment");
  });
});
