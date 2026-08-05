import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

// The anonymous reader's identity, and the storage reads around it.
//
// `visitorToken()` was implemented three times, byte-identical, all reading the
// literal "sojourn:vid" — the value that decides whose reaction is toggled,
// whose vote is counted, and who gets a reply notification. Three copies is
// three places to change, and a missed one silently splits one reader in two.
//
// Next to it, two components did `JSON.parse(localStorage.getItem(...))` bare,
// inside a useEffect. Corrupt storage throws SyntaxError; a stored scalar
// throws "number is not iterable" from the Set constructor. Either escapes to
// the error boundary and removes the comments section or the reactions block,
// on a page the visitor can only repair by clearing site data they do not know
// about.

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
  // Both functions bail out when there is no `window` — they are client-only
  // and must not touch storage during SSR. The test environment is node, so it
  // needs one, or every assertion below passes against an early return.
  vi.stubGlobal("window", { localStorage: globalThis.localStorage });
});

const { visitorToken, readStringSet } = await import("@/lib/visitor");

describe("visitorToken", () => {
  it("mints one on first use and keeps it thereafter", () => {
    const first = visitorToken();
    expect(first).toBeTruthy();
    expect(visitorToken()).toBe(first);
  });

  it("reuses whatever is already stored", () => {
    store.set("sojourn:vid", "existing-token-value");
    expect(visitorToken()).toBe("existing-token-value");
  });
});

describe("readStringSet", () => {
  it("reads a stored array", () => {
    store.set("k", JSON.stringify(["a", "b"]));
    expect([...readStringSet("k")].sort()).toEqual(["a", "b"]);
  });

  it("is empty when nothing is stored", () => {
    expect(readStringSet("missing").size).toBe(0);
  });

  it("survives corrupt JSON", () => {
    // The SyntaxError case: previously thrown from inside a useEffect.
    store.set("k", "{not json");
    expect(readStringSet("k").size).toBe(0);
  });

  it("survives a stored scalar", () => {
    // The "number is not iterable" case, thrown by `new Set(5)`.
    store.set("k", "5");
    expect(readStringSet("k").size).toBe(0);
  });

  it("survives a stored object", () => {
    store.set("k", JSON.stringify({ a: 1 }));
    expect(readStringSet("k").size).toBe(0);
  });

  it("drops non-string entries rather than trusting the array", () => {
    store.set("k", JSON.stringify(["a", 7, null, "b"]));
    expect([...readStringSet("k")].sort()).toEqual(["a", "b"]);
  });
});

describe("the reader identity has one definition", () => {
  it("no component re-implements it", () => {
    const offenders = globSync("src/components/**/*.tsx").filter((f) =>
      /function visitorToken\s*\(/.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders,
      "visitorToken is defined outside @/lib/visitor; three copies is how one reader becomes two",
    ).toEqual([]);
  });

  it("the storage key is written down exactly once", () => {
    const files = [...globSync("src/**/*.ts"), ...globSync("src/**/*.tsx")];
    const withKey = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // Ignore prose; count only code occurrences.
      return src.split(/\r?\n/).some(
        (l) => l.includes('"sojourn:vid"') && !l.trim().startsWith("//"),
      );
    });
    expect(withKey.map((f) => f.replace(/\\/g, "/"))).toEqual(["src/lib/visitor.ts"]);
  });
});
