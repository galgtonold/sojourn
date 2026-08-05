import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

// public/sw.js had no test at all, which is part of how the missing
// `pushsubscriptionchange` listener survived: nothing exercised the worker,
// and the failure it causes is silence rather than an error.
//
// The worker is plain JS built on `self.addEventListener`, so it can be loaded
// into a fake global scope and its listeners called directly.

type Listeners = Record<string, (event: unknown) => void>;

function loadWorker(overrides: {
  getSubscription?: () => Promise<unknown>;
  subscribe?: (opts: unknown) => Promise<unknown>;
  fetch?: typeof fetch;
}) {
  const listeners: Listeners = {};
  const subscribe = overrides.subscribe ?? (async () => null);
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
    location: { search: "?v=test", origin: "https://example.test" },
    registration: {
      showNotification: vi.fn(async () => {}),
      pushManager: {
        getSubscription: overrides.getSubscription ?? (async () => null),
        subscribe,
      },
    },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    skipWaiting: async () => {},
  };
  const caches = {
    open: async () => ({ addAll: async () => {}, match: async () => undefined, put: async () => {} }),
    keys: async () => [],
    delete: async () => true,
  };
  const src = readFileSync("public/sw.js", "utf8");
  // `self`, `caches` and `fetch` are passed as parameters so they shadow the
  // real globals — the worker sees the fakes, and nothing here touches the
  // network or the cache API.
  new Function("self", "caches", "fetch", src)(self, caches, overrides.fetch ?? fetch);
  return { listeners, self };
}

/** Fire pushsubscriptionchange and wait for whatever it passed to waitUntil. */
async function rotate(listeners: Listeners, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  listeners["pushsubscriptionchange"]({
    ...event,
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
}

const OLD = "https://fcm.googleapis.com/fcm/send/OLD";
const NEW = "https://fcm.googleapis.com/fcm/send/NEW";

function subscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p-" + endpoint, auth: "a-" + endpoint } }),
  };
}

let posted: { url: string; body: Record<string, unknown> }[] = [];
const recordingFetch = (async (url: string, init: RequestInit) => {
  posted.push({ url, body: JSON.parse(String(init.body)) });
  return { ok: true } as Response;
}) as unknown as typeof fetch;

beforeEach(() => {
  posted = [];
});

describe("sw.js pushsubscriptionchange", () => {
  it("registers a listener at all", () => {
    const { listeners } = loadWorker({});
    expect(typeof listeners["pushsubscriptionchange"]).toBe("function");
  });

  it("reports the replacement the browser handed it", async () => {
    const { listeners } = loadWorker({ fetch: recordingFetch });
    await rotate(listeners, {
      oldSubscription: { endpoint: OLD },
      newSubscription: subscription(NEW),
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe("/api/push/migrate");
    expect(posted[0].body.oldEndpoint).toBe(OLD);
    expect(posted[0].body.endpoint).toBe(NEW);
    expect(posted[0].body.keys).toEqual({ p256dh: "p-" + NEW, auth: "a-" + NEW });
  });

  it("subscribes again when the browser fires without a replacement", async () => {
    // Which is the common case in Chrome — newSubscription is usually absent,
    // so a handler that only read that field would do nothing at all.
    const subscribeSpy = vi.fn(async () => subscription(NEW));
    const { listeners } = loadWorker({
      fetch: recordingFetch,
      getSubscription: async () => null,
      subscribe: subscribeSpy,
    });

    await rotate(listeners, {
      oldSubscription: {
        endpoint: OLD,
        options: { applicationServerKey: new Uint8Array([1, 2, 3]) },
      },
    });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(1);
    expect(posted[0].body.endpoint).toBe(NEW);
  });

  it("prefers a subscription that already exists over making another", async () => {
    const subscribeSpy = vi.fn(async () => subscription("https://fcm.googleapis.com/fcm/send/THIRD"));
    const { listeners } = loadWorker({
      fetch: recordingFetch,
      getSubscription: async () => subscription(NEW),
      subscribe: subscribeSpy,
    });

    await rotate(listeners, { oldSubscription: { endpoint: OLD } });

    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(posted[0].body.endpoint).toBe(NEW);
  });

  it("sends nothing when there is no old endpoint to match on", async () => {
    // Creating a row from a rotation we cannot attribute would be inventing a
    // subscription, so the correct move is to do nothing.
    const { listeners } = loadWorker({
      fetch: recordingFetch,
      getSubscription: async () => subscription(NEW),
    });
    await rotate(listeners, { newSubscription: subscription(NEW) });
    expect(posted).toHaveLength(0);
  });

  it("swallows a failing request rather than rejecting waitUntil", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const { listeners } = loadWorker({ fetch: failing });
    await expect(
      rotate(listeners, {
        oldSubscription: { endpoint: OLD },
        newSubscription: subscription(NEW),
      }),
    ).resolves.not.toThrow();
  });
});
