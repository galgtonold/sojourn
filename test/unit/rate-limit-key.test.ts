import { describe, it, expect, afterEach } from "vitest";
import { clientIp, limitFor, SHARED_CLIENT } from "@/lib/rate-limit";

// Ten endpoints throttle by client IP, and the IP came from `x-forwarded-for`
// with no notion of whether that header could be believed. Measured against a
// real all-in-one install, that failed in both directions at once:
//
//   25 requests, no XFF          → 20x 200 then 5x 429
//     Nothing sets the header when the container is published directly, so
//     every visitor keyed as "unknown" and the SITE shared one allowance:
//     10 comments a minute between all readers.
//
//   25 requests, rotating XFF    → 25x 200
//     The header is whatever the client sends, so the limit was skipped by
//     changing it. Honest readers were throttled; nobody else was.

const req = (headers: Record<string, string> = {}) =>
  new Request("http://t/api/comments", { headers });

const withEnv = (vars: Record<string, string | undefined>, run: () => void) => {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.TRUST_PROXY_HEADERS;
});

describe("clientIp", () => {
  it("ignores a forwarded header nobody vouched for", () => {
    // The whole of A2: believing this unconditionally is what made the limit
    // optional for anyone willing to send a different value each time.
    withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: undefined }, () => {
      expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe(SHARED_CLIENT);
      expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe(SHARED_CLIENT);
    });
  });

  it("believes it on Vercel, which sets it itself", () => {
    // The platform overwrites any inbound copy, so there it is authoritative
    // and per-visitor limiting genuinely works.
    withEnv({ VERCEL: "1" }, () => {
      expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    });
  });

  it("believes it when an operator explicitly vouches for their proxy", () => {
    withEnv({ TRUST_PROXY_HEADERS: "1" }, () => {
      expect(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
        "203.0.113.9",
      );
    });
  });

  it("falls back to shared when trusted but the header is absent", () => {
    withEnv({ TRUST_PROXY_HEADERS: "1" }, () => {
      expect(clientIp(req())).toBe(SHARED_CLIENT);
    });
  });
});

describe("limitFor", () => {
  it("gives an identified client its own per-visitor allowance", () => {
    withEnv({ VERCEL: "1" }, () => {
      const { ip, limit } = limitFor(req({ "x-forwarded-for": "203.0.113.9" }), 10);
      expect(ip).toBe("203.0.113.9");
      expect(limit).toBe(10);
    });
  });

  it("raises the ceiling when the bucket is everyone at once", () => {
    // A1: keeping 10/minute here would mean ten comments a minute for the whole
    // site. Unidentified traffic still gets a ceiling — it is a flood guard
    // rather than a fairness rule, so it is sized like one.
    withEnv({ VERCEL: undefined, TRUST_PROXY_HEADERS: undefined }, () => {
      const { ip, limit } = limitFor(req({ "x-forwarded-for": "203.0.113.9" }), 10);
      expect(ip).toBe(SHARED_CLIENT);
      expect(limit).toBeGreaterThan(10);
    });
  });

  it("still bounds a flood rather than going unlimited", () => {
    withEnv({ VERCEL: undefined }, () => {
      const { limit } = limitFor(req(), 10);
      expect(Number.isFinite(limit)).toBe(true);
      expect(limit).toBeLessThan(10_000);
    });
  });
});
