import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ server: null as unknown, admin: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => sb.server }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => sb.admin }));

import { POST } from "@/app/api/push/route";

function call(body: unknown) {
  return POST(new Request("http://t/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  // server client only used for auth.getUser(); admin client holds the table.
  sb.server = makeFakeSupabase({});
  sb.admin = makeFakeSupabase({ push_subscriptions: [] });
});

describe("POST /api/push", () => {
  it("stores visitor_token on a viewer subscription", async () => {
    const res = await call({
      endpoint: "https://push.test/abc",
      keys: { p256dh: "x", auth: "y" },
      audience: "viewer",
      visitorToken: "reader-token-1",
    });
    expect(res.status).toBe(200);
    const row = (sb.admin as FakeSupabase).store.push_subscriptions[0];
    expect(row.audience).toBe("viewer");
    expect(row.visitor_token).toBe("reader-token-1");
  });
});
