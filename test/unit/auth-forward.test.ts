// The forwarded viewer header lets a page skip re-verifying a session the
// middleware already verified. It is only safe because it is signed: /api/admin/*
// is outside the middleware matcher, so an attacker could otherwise send this
// header themselves and be trusted as any user. Every one of these tests is
// guarding that.
import { describe, it, expect } from "vitest";
import { signViewer, verifyViewer, VIEWER_TTL_MS } from "@/lib/auth-forward";

const KEY = "test-service-role-key-long-enough";
const UID = "11111111-2222-3333-4444-555555555555";
const NOW = 1_700_000_000_000;

describe("verifyViewer accepts what signViewer produced", () => {
  it("round-trips the user id", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    expect(await verifyViewer(signed, KEY, NOW)).toBe(UID);
  });

  it("still accepts just before expiry", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    expect(await verifyViewer(signed, KEY, NOW + VIEWER_TTL_MS - 1)).toBe(UID);
  });
});

describe("verifyViewer rejects everything else", () => {
  it("rejects an absent header", async () => {
    expect(await verifyViewer(null, KEY, NOW)).toBeNull();
    expect(await verifyViewer(undefined, KEY, NOW)).toBeNull();
    expect(await verifyViewer("", KEY, NOW)).toBeNull();
  });

  it("rejects an unsigned id — the naive forgery", async () => {
    expect(await verifyViewer(UID, KEY, NOW)).toBeNull();
    expect(await verifyViewer(`${UID}.${NOW + 1000}`, KEY, NOW)).toBeNull();
  });

  it("rejects a tampered user id", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    const [, exp, sig] = signed.split(".");
    const attacker = "99999999-9999-9999-9999-999999999999";
    expect(await verifyViewer(`${attacker}.${exp}.${sig}`, KEY, NOW)).toBeNull();
  });

  it("rejects a tampered expiry", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    const [uid, , sig] = signed.split(".");
    expect(await verifyViewer(`${uid}.${NOW + 999_999}.${sig}`, KEY, NOW)).toBeNull();
  });

  it("rejects a bad signature", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    const [uid, exp] = signed.split(".");
    expect(await verifyViewer(`${uid}.${exp}.${"0".repeat(64)}`, KEY, NOW)).toBeNull();
  });

  it("rejects a signature made with a different key", async () => {
    const signed = await signViewer(UID, "some-other-key", NOW);
    expect(await verifyViewer(signed, KEY, NOW)).toBeNull();
  });

  it("rejects an expired signature", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    expect(await verifyViewer(signed, KEY, NOW + VIEWER_TTL_MS + 1)).toBeNull();
  });

  it("rejects garbage and wrong-arity values", async () => {
    for (const v of ["...", "a.b", "a.b.c.d", "....", "not-a-header"]) {
      expect(await verifyViewer(v, KEY, NOW)).toBeNull();
    }
  });

  it("rejects an empty key rather than signing with nothing", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    expect(await verifyViewer(signed, "", NOW)).toBeNull();
  });
});
