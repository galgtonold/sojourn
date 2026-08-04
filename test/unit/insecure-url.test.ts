import { describe, it, expect } from "vitest";
import { isInsecurePublicUrl, insecurePublicUrlWarning } from "@/lib/insecure-url";

// The all-in-one ships an http:// default that is correct locally. The mistake
// this catches is the obvious edit — deploy to a VPS, change the host, leave
// the scheme — after which the owner's password crosses the wire in the clear
// and nothing says so.

describe("it stays quiet where there is no network to listen on", () => {
  for (const url of [
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://host.docker.internal:8000", // the shipped default
    "http://sojourn.local:8000",
    "https://supabase.example.com",
    "https://sojourn.wolkendiener.de",
  ]) {
    it(`accepts ${url}`, () => expect(isInsecurePublicUrl(url)).toBe(false));
  }
});

describe("it warns about plain HTTP on a real host", () => {
  for (const url of [
    "http://sojourn.example.com",
    "http://203.0.113.10:8000",
    "http://my-vps.hetzner.cloud:8000",
    // A private LAN address is still a network with other machines on it.
    "http://192.168.1.50:8000",
  ]) {
    it(`warns about ${url}`, () => expect(isInsecurePublicUrl(url)).toBe(true));
  }
});

describe("it says nothing when there is nothing to say", () => {
  it("ignores unset and malformed values", () => {
    // A missing or broken URL is reported elsewhere, with a better message.
    expect(isInsecurePublicUrl(undefined)).toBe(false);
    expect(isInsecurePublicUrl(null)).toBe(false);
    expect(isInsecurePublicUrl("")).toBe(false);
    expect(isInsecurePublicUrl("not a url")).toBe(false);
  });
});

describe("the warning names the consequence, not just the setting", () => {
  it("says what is actually exposed", () => {
    const w = insecurePublicUrlWarning("http://sojourn.example.com");
    expect(w).toContain("http://sojourn.example.com");
    expect(w.toLowerCase()).toContain("password");
    expect(w.toLowerCase()).toMatch(/session|token/);
    expect(w).toContain("https://");
  });
});
