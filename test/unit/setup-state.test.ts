import { describe, it, expect, vi, beforeEach } from "vitest";

const adm = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => adm.client }));

import { getSetupState } from "@/lib/setup";

/** Minimal admin whose profiles owner-query resolves to `result`. */
function adminWithOwnerQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return { from: () => q };
}

beforeEach(() => {
  adm.client = null;
});

describe("getSetupState", () => {
  it("is unknown when the service role is not configured", async () => {
    expect(await getSetupState()).toBe("unknown");
  });

  it("needs setup while no owner profile exists", async () => {
    adm.client = adminWithOwnerQuery({ data: [], error: null });
    expect(await getSetupState()).toBe("needs-setup");
  });

  it("is configured once an owner exists", async () => {
    adm.client = adminWithOwnerQuery({ data: [{ id: "u1" }], error: null });
    expect(await getSetupState()).toBe("configured");
  });

  it("is unknown when the owner lookup fails (e.g. migrations not applied)", async () => {
    adm.client = adminWithOwnerQuery({
      data: null,
      error: { message: 'relation "profiles" does not exist' },
    });
    expect(await getSetupState()).toBe("unknown");
  });
});
