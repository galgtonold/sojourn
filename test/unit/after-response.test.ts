import { describe, it, expect, vi, beforeEach } from "vitest";

// Work that outlives the response.
//
// Every notification in this app used to be started as a floating promise and
// then abandoned: `notifyComment(...).catch(log)` immediately followed by
// `return NextResponse.json(...)`. On Vercel the instance is FROZEN the moment
// the response is flushed, so the Supabase queries and the FCM requests behind
// them were suspended mid-flight. If another request happened to land on the
// same instance it thawed and finished; otherwise the work was discarded when
// the instance was recycled.
//
// That is why it always worked when tested and failed in real use: testing
// means clicking around, which keeps the instance warm. A single comment
// arriving on a quiet site gets no such traffic.
//
// `after()` is the framework's answer — it hands the work to the platform's
// waitUntil, which keeps the instance alive until the work settles.

const nextAfter = vi.hoisted(() => ({
  fn: null as null | ((work: () => unknown) => void),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (work: () => unknown) => {
    if (!nextAfter.fn) throw new Error("`after` was called outside a request scope.");
    nextAfter.fn(work);
  },
}));

import { afterResponse } from "@/lib/after-response";

beforeEach(() => {
  nextAfter.fn = null;
});

describe("afterResponse", () => {
  it("hands the work to after(), rather than letting it float", async () => {
    const registered: (() => unknown)[] = [];
    nextAfter.fn = (w) => registered.push(w);

    let ran = false;
    afterResponse("test.scope", async () => {
      ran = true;
    });

    // Registered, but NOT yet run — the platform runs it once the response is
    // out. Running it here instead would be the old bug wearing a new name.
    expect(registered).toHaveLength(1);
    expect(ran).toBe(false);

    await registered[0]();
    expect(ran).toBe(true);
  });

  it("still runs the work when there is no request scope", async () => {
    // Self-hosted Sojourn is a long-lived Node server: nothing freezes there,
    // so a floating promise is genuinely fine. Scripts and unit tests land
    // here too. The one thing that must not happen is the work being dropped.
    let ran = false;
    afterResponse("test.scope", async () => {
      ran = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toBe(true);
  });

  it("logs a rejection instead of raising an unhandled rejection", async () => {
    const registered: (() => unknown)[] = [];
    nextAfter.fn = (w) => registered.push(w);

    afterResponse("test.scope", async () => {
      throw new Error("FCM said no");
    });

    // Must settle, not reject: an unhandled rejection inside after() can take
    // the whole invocation down and lose every other notification with it.
    await expect(registered[0]()).resolves.not.toThrow();
  });

  it("does not let a synchronous throw escape into the handler", async () => {
    // A caller that throws before its first await would otherwise fail the
    // request itself — the visitor's comment would 500 because a push broke.
    const registered: (() => unknown)[] = [];
    nextAfter.fn = (w) => registered.push(w);

    expect(() =>
      afterResponse("test.scope", () => {
        throw new Error("thrown before any await");
      }),
    ).not.toThrow();
    await expect(registered[0]()).resolves.not.toThrow();
  });
});
