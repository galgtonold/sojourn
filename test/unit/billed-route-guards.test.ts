import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { makeFakeSupabase } from "../helpers/fake-supabase";

// Three routes that spend the operator's money, and what they asked before
// spending it.
//
// `adminRoute` exists because "a session is not a permission" — Supabase issued
// sessions to anyone who asked until 0043, and even with signups closed, signed
// in and allowed are different questions. Eleven routes under /api/admin never
// went through that wrapper. These are the two of them that reach a billed
// provider, plus the one public endpoint that does.

const sb = vi.hoisted(() => ({ client: null as unknown }));
const translated = vi.hoisted(() => ({ calls: [] as unknown[] }));
const limiter = vi.hoisted(() => ({ allow: true }));

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => sb.client }));
vi.mock("@/lib/ai/translate", () => ({
  triggerPostTranslation: (...args: unknown[]) => {
    translated.calls.push(args);
    return Promise.resolve();
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(limiter.allow),
  clientIp: () => "1.1.1.1",
  limitFor: (_r: unknown, l: number) => ({ ip: "1.1.1.1", limit: l }),
}));
vi.mock("@/lib/content", () => ({ searchAll: async () => ({ posts: [], photos: [] }) }));

import { POST as translatePost } from "@/app/api/admin/posts/[id]/translate/route";
import { GET as search } from "@/app/api/search/route";

const POST_ID = "11111111-1111-1111-1111-111111111111";

function callTranslate() {
  return translatePost(new Request("http://t", { method: "POST" }), {
    params: Promise.resolve({ id: POST_ID }),
  });
}

beforeEach(() => {
  translated.calls = [];
  limiter.allow = true;
});

describe("forcing a translation requires the right to edit that post", () => {
  it("refuses a session that may not edit it, without spending anything", async () => {
    // The fake's update applies its filters, so a row the caller cannot reach
    // yields no rows — the same signal RLS gives through PostgREST. This is the
    // collaborator-reaching-outside-their-trips case, and the profile-less
    // session case, which are the same query.
    sb.client = makeFakeSupabase({ posts: [] });
    const res = await callTranslate();
    expect(res.status).toBe(403);
    expect(
      translated.calls,
      "an 8000-token run was started for a caller who may not edit the post",
    ).toHaveLength(0);
  });

  it("proceeds when the update comes back with a row", async () => {
    sb.client = makeFakeSupabase({
      posts: [{ id: POST_ID, translation_status: "ready" }],
    });
    const res = await callTranslate();
    expect(res.status).toBe(200);
    expect(translated.calls).toHaveLength(1);
    expect(translated.calls[0]).toEqual([POST_ID, { force: true }]);
  });

  it("proves permission with an update, not a read", async () => {
    // `read published posts` lets anyone read a published row, so a SELECT
    // proves nothing. The UPDATE policy is `is_owner() or can_edit_post(id)`.
    const src = readFileSync(
      "src/app/api/admin/posts/[id]/translate/route.ts",
      "utf8",
    );
    expect(src).toMatch(/\.update\(\{ translation_status: "pending" \}\)/);
    expect(src).toMatch(/status: 403/);
  });

  it("still refuses an anonymous caller", async () => {
    sb.client = null;
    const res = await callTranslate();
    expect([401, 503]).toContain(res.status);
    expect(translated.calls).toHaveLength(0);
  });
});

describe("the embeddings route asks for a profile", () => {
  it("checks profiles rather than stopping at a user", async () => {
    // Asserted on the source: the route's own reads are RLS-scoped, so a
    // profile-less session gets an empty result set rather than an error, and a
    // behavioural test would pass whether or not the check is there.
    const src = readFileSync(
      "src/app/api/admin/ai/embeddings/route.ts",
      "utf8",
    );
    expect(src).toMatch(/from\("profiles"\)/);
    expect(src).toMatch(/role !== "owner" && role !== "member"/);
    expect(src).toMatch(/status: 403/);
  });
});

describe("public search has a ceiling", () => {
  it("refuses once the limit is reached", async () => {
    limiter.allow = false;
    const res = await search(new Request("http://t/api/search?q=berg"));
    expect(res.status).toBe(429);
  });

  it("answers normally under the limit", async () => {
    limiter.allow = true;
    const res = await search(new Request("http://t/api/search?q=berg"));
    expect(res.status).toBe(200);
  });
});
