import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ client: null as unknown }));
const spies = vi.hoisted(() => ({
  notifyComment: vi.fn(() => Promise.resolve()),
  notifyCommentAuthor: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => sb.client }));
vi.mock("@/lib/supabase/public", () => ({ getPublicSupabase: () => sb.client }));
vi.mock("@/lib/notify", () => spies);
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true, clientIp: () => "1.1.1.1", limitFor: (_r: unknown, l: number) => ({ ip: "1.1.1.1", limit: l }) }));

import { POST } from "@/app/api/comments/route";

function call(body: unknown) {
  return POST(new Request("http://t/api/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  sb.client = makeFakeSupabase({ comments: [] });
  spies.notifyComment.mockClear();
  spies.notifyCommentAuthor.mockClear();
});

describe("POST /api/comments", () => {
  it("stores the visitor_token and notifies the parent author on a reply", async () => {
    const res = await call({ postId: "p1", parentId: "11111111-1111-1111-1111-111111111111", authorName: "Bob", body: "nice", visitorToken: "tok-bob-123" });
    expect(res.status).toBe(201);
    const row = (sb.client as FakeSupabase).store.comments[0];
    expect(row.visitor_token).toBe("tok-bob-123");
    expect(spies.notifyCommentAuthor).toHaveBeenCalledTimes(1);
    expect(spies.notifyCommentAuthor).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "tok-bob-123",
      expect.objectContaining({ kind: "reply", actorName: "Bob" }),
    );
  });

  it("does not notify on a top-level comment", async () => {
    await call({ postId: "p1", authorName: "Bob", body: "hi", visitorToken: "tok-bob-123" });
    expect(spies.notifyCommentAuthor).not.toHaveBeenCalled();
  });
});
