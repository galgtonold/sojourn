import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ client: null as unknown }));
const spies = vi.hoisted(() => ({ notifyCommentAuthor: vi.fn(() => Promise.resolve()) }));

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => sb.client }));
vi.mock("@/lib/notify", () => spies);
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true, clientIp: () => "1.1.1.1", limitFor: (_r: unknown, l: number) => ({ ip: "1.1.1.1", limit: l }) }));

import { POST } from "@/app/api/comments/like/route";

function call(body: unknown) {
  return POST(new Request("http://t/api/comments/like", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  sb.client = makeFakeSupabase({ comment_likes: [] });
  spies.notifyCommentAuthor.mockClear();
});

describe("POST /api/comments/like", () => {
  it("notifies the comment author when a like is added", async () => {
    const res = await call({ commentId: "11111111-1111-1111-1111-111111111111", token: "liker-token-1", action: "add" });
    expect(res.status).toBe(200);
    expect(spies.notifyCommentAuthor).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "liker-token-1",
      expect.objectContaining({ kind: "like" }),
    );
  });

  it("does not notify when a like is removed", async () => {
    await call({ commentId: "11111111-1111-1111-1111-111111111111", token: "liker-token-1", action: "remove" });
    expect(spies.notifyCommentAuthor).not.toHaveBeenCalled();
  });
});
