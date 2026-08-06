import { describe, it, expect } from "vitest";
import {
  claimWindowState,
  claimWindowDecision,
  deriveInstance,
  currentInstance,
} from "@/lib/setup-window";

const opened = "2026-07-28T12:00:00.000Z";
const at = (iso: string) => new Date(iso).getTime();

describe("claimWindowState", () => {
  it("is open inside the window", () => {
    expect(claimWindowState(opened, 60, at("2026-07-28T12:59:00Z"))).toBe("open");
  });

  it("expires once the window has passed", () => {
    expect(claimWindowState(opened, 60, at("2026-07-28T13:01:00Z"))).toBe(
      "expired",
    );
  });

  it("expires exactly on the boundary", () => {
    expect(claimWindowState(opened, 60, at("2026-07-28T13:00:00Z"))).toBe(
      "expired",
    );
  });

  it("stays open forever when the guard is switched off", () => {
    expect(claimWindowState(opened, 0, at("2027-01-01T00:00:00Z"))).toBe("open");
    expect(claimWindowState(opened, -1, at("2027-01-01T00:00:00Z"))).toBe(
      "open",
    );
  });

  // Fail open: a missing or unreadable timestamp must never strand an operator
  // who cannot claim their own install.
  it("stays open when the install has no recorded start", () => {
    expect(claimWindowState(null, 60, at("2027-01-01T00:00:00Z"))).toBe("open");
  });

  it("stays open when the timestamp is unreadable", () => {
    expect(claimWindowState("not-a-date", 60, at("2027-01-01T00:00:00Z"))).toBe(
      "open",
    );
  });

  it("treats a reopened window as a fresh start", () => {
    const reopened = "2026-07-28T14:00:00.000Z";
    expect(claimWindowState(reopened, 60, at("2026-07-28T14:30:00Z"))).toBe(
      "open",
    );
  });
});

describe("deriveInstance", () => {
  it("is stable within the same second", () => {
    const bootMs = 1_700_000_000_100;
    expect(deriveInstance({}, bootMs)).toBe(deriveInstance({}, bootMs + 300));
  });

  it("differs after a restart", () => {
    expect(deriveInstance({}, 1_700_000_000_000)).not.toBe(
      deriveInstance({}, 1_700_000_090_000),
    );
  });

  it("prefers the Vercel deployment id, so cold starts share it", () => {
    expect(
      deriveInstance({ VERCEL_DEPLOYMENT_ID: "dpl_1", VERCEL: "1" }, 1),
    ).toBe("dpl_1");
    expect(deriveInstance({ VERCEL_URL: "x.vercel.app", VERCEL: "1" }, 1)).toBe(
      "x.vercel.app",
    );
  });

  it("pins the value on Vercel when no identifier is exposed", () => {
    // Never invent one here: a per-instance id would reopen the window on
    // every cold start and quietly disable the guard.
    expect(deriveInstance({ VERCEL: "1" }, 1)).toBe("vercel");
    expect(deriveInstance({ VERCEL: "1" }, 999_999)).toBe("vercel");
  });

  it("pins the value when boot time is unavailable", () => {
    expect(deriveInstance({}, null)).toBe("unknown-boot");
  });
});

describe("currentInstance", () => {
  // The regression this exists for: identity was cached in module scope, but
  // Next bundles the page and the route handler separately, so each held its
  // own — and /api/setup then reopened the window the page had just refused.
  // One process has one globalThis; both bundles must resolve through it.
  it("resolves through a process-wide cache, so separate bundles agree", () => {
    const g = globalThis as Record<string, unknown>;
    delete g["__sojourn_setup_instance"];

    const fromPageBundle = currentInstance();
    expect(g["__sojourn_setup_instance"]).toBe(fromPageBundle);

    // A second bundle calling later must read the cache, not re-derive.
    g["__sojourn_setup_instance"] = "pinned-by-first-bundle";
    expect(currentInstance()).toBe("pinned-by-first-bundle");

    delete g["__sojourn_setup_instance"];
  });
});

describe("claimWindowDecision — restarting reopens the window", () => {
  const lapsed = { openedAt: opened, instance: "deploy-1" };
  const now = at("2026-07-28T20:00:00Z"); // long past a 60-minute window

  it("reopens for a new deployment and records it", () => {
    expect(claimWindowDecision(lapsed, "deploy-2", 60, now)).toEqual({
      state: "open",
      reopen: true,
    });
  });

  it("stays expired for the same deployment, so cold starts change nothing", () => {
    expect(claimWindowDecision(lapsed, "deploy-1", 60, now)).toEqual({
      state: "expired",
      reopen: false,
    });
  });

  it("opens on an install that has never recorded a deployment", () => {
    expect(
      claimWindowDecision({ openedAt: opened, instance: null }, "deploy-1", 60, now),
    ).toEqual({ state: "open", reopen: true });
  });

  it("does not rewrite the window while it is still running", () => {
    const fresh = at("2026-07-28T12:30:00Z");
    expect(claimWindowDecision(lapsed, "deploy-1", 60, fresh)).toEqual({
      state: "open",
      reopen: false,
    });
  });

  it("respects the guard being switched off without churning the row", () => {
    expect(claimWindowDecision(lapsed, "deploy-1", 0, now)).toEqual({
      state: "open",
      reopen: false,
    });
  });
});
