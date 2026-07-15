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

describe("signViewer fails safe on a missing key", () => {
  it("returns null instead of signing with nothing (crypto.subtle rejects a zero-length key)", async () => {
    expect(await signViewer(UID, "", NOW)).toBeNull();
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
    const [, exp, sig] = signed!.split(".");
    const attacker = "99999999-9999-9999-9999-999999999999";
    expect(await verifyViewer(`${attacker}.${exp}.${sig}`, KEY, NOW)).toBeNull();
  });

  it("rejects a tampered expiry", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    const [uid, , sig] = signed!.split(".");
    expect(await verifyViewer(`${uid}.${NOW + 999_999}.${sig}`, KEY, NOW)).toBeNull();
  });

  it("rejects a bad signature", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    const [uid, exp] = signed!.split(".");
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

  it("verifies with an empty key rather than accepting anything unsigned", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    expect(await verifyViewer(signed, "", NOW)).toBeNull();
  });

  // These three exist to exercise `if (!userId || !expiryRaw || !sig) return null;`
  // in verifyViewer, which no other test reaches: garbage splits to lengths that are
  // never exactly 3 parts with an empty one, EXCEPT these shapes. Without the guard,
  // signViewer("", KEY, NOW) produces ".<exp>.<sig>", and verifyViewer would return
  // "" — falsy, but NOT null, breaking the "null means unverified" contract for any
  // caller doing `=== null`.
  it("rejects an empty user id even when correctly signed", async () => {
    const signed = await signViewer("", KEY, NOW);
    expect(await verifyViewer(signed, KEY, NOW)).toBeNull();
  });

  it("rejects an empty expiry field (uid.100.)", async () => {
    expect(await verifyViewer("uid.100.", KEY, NOW)).toBeNull();
  });

  it("rejects an empty user-id field (.100.sig)", async () => {
    expect(await verifyViewer(".100.sig", KEY, NOW)).toBeNull();
  });

  // Regression for the raw-expiry comment on hmacHex(`${userId}.${expiryRaw}`, key):
  // Number(expiryRaw) is loose, so if verify ever hashed the *parsed* number instead
  // of the raw string, these differently-spelled-but-equal-numeric expiries would
  // reuse a legitimate signature and forge a valid token.
  it("rejects same-value expiry spelled with a leading + or as hex, even reusing a real signature", async () => {
    const signed = await signViewer(UID, KEY, NOW);
    const [uid, exp, sig] = signed!.split(".");
    const plusVariant = `${uid}.+${exp}.${sig}`;
    const hexVariant = `${uid}.0x${Number(exp).toString(16)}.${sig}`;
    expect(Number(`+${exp}`)).toBe(Number(exp));
    expect(Number(`0x${Number(exp).toString(16)}`)).toBe(Number(exp));
    expect(await verifyViewer(plusVariant, KEY, NOW)).toBeNull();
    expect(await verifyViewer(hexVariant, KEY, NOW)).toBeNull();
  });
});
