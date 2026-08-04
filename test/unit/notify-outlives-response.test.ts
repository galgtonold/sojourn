import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

// The routes that send notifications must hand that work to after(), so the
// platform keeps the instance alive until it finishes. See after-response.ts
// for why — the short version is that a floating promise on Vercel is frozen
// with the response and usually never resumes.
//
// This is a behavioural test rather than a source-text one: it calls the real
// handlers and asserts that the notification happened inside a registered
// after() callback and not before the response was returned.

const registered = vi.hoisted(() => ({ work: [] as (() => unknown)[] }));
const sb = vi.hoisted(() => ({ client: null as unknown }));
const spies = vi.hoisted(() => ({
  notifyComment: vi.fn(() => Promise.resolve()),
  notifyCommentAuthor: vi.fn(() => Promise.resolve()),
  notifyViewers: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (work: () => unknown) => {
    registered.work.push(work);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => sb.client }));
vi.mock("@/lib/supabase/public", () => ({ getPublicSupabase: () => sb.client }));
vi.mock("@/lib/notify", () => spies);
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  clientIp: () => "1.1.1.1",
}));

import { POST as postComment } from "@/app/api/comments/route";
import { POST as postLike } from "@/app/api/comments/like/route";

beforeEach(() => {
  registered.work = [];
  sb.client = makeFakeSupabase({
    comments: [{ id: "11111111-1111-1111-1111-111111111111", post_id: "p1", visitor_token: "tok-other-1" }],
    comment_likes: [],
  });
  spies.notifyComment.mockClear();
  spies.notifyCommentAuthor.mockClear();
  spies.notifyViewers.mockClear();
});

function comment(body: unknown) {
  return postComment(
    new Request("http://t/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("notification work outlives the response", () => {
  it("POST /api/comments registers the admin notification with after()", async () => {
    const res = await comment({
      postId: "p1",
      authorName: "Bob",
      body: "nice one",
      visitorToken: "tok-bob-123",
    });
    expect(res.status).toBe(201);

    // The whole point: the response is already built and the notification has
    // NOT run yet. Before this fix it had — synchronously, into a promise the
    // handler then abandoned.
    expect(spies.notifyComment).not.toHaveBeenCalled();
    expect(registered.work.length).toBeGreaterThan(0);

    await Promise.all(registered.work.map((w) => w()));
    expect(spies.notifyComment).toHaveBeenCalledTimes(1);
  });

  it("POST /api/comments registers the reply notification too", async () => {
    await comment({
      postId: "p1",
      parentId: "11111111-1111-1111-1111-111111111111",
      authorName: "Bob",
      body: "replying",
      visitorToken: "tok-bob-123",
    });
    expect(spies.notifyCommentAuthor).not.toHaveBeenCalled();

    await Promise.all(registered.work.map((w) => w()));
    expect(spies.notifyCommentAuthor).toHaveBeenCalledTimes(1);
  });

  it("POST /api/comments/like registers the like notification", async () => {
    const res = await postLike(
      new Request("http://t/api/comments/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commentId: "11111111-1111-1111-1111-111111111111",
          token: "tok-liker-123",
          action: "add",
        }),
      }),
    );
    expect(res.status).toBeLessThan(400);
    expect(spies.notifyCommentAuthor).not.toHaveBeenCalled();

    await Promise.all(registered.work.map((w) => w()));
    expect(spies.notifyCommentAuthor).toHaveBeenCalledTimes(1);
  });
});
