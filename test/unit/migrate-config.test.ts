import { describe, it, expect } from "vitest";
import {
  resolveDatabaseUrl,
  describeConnection,
  looksTransactionPooled,
  sslDefaultFor,
  URL_VARS,
} from "@/lib/migrate-config.mjs";

// The runner prints where it connected on every run, into build logs that are
// not private. And it holds one advisory lock across every migration, which a
// transaction pooler would quietly make meaningless. Both are things you only
// find out you got wrong afterwards, so they are pinned here.

const PW = "s3cr3t-p4ssw0rd";
const SUPABASE = `postgresql://postgres:${PW}@db.abcdefgh.supabase.co:5432/postgres?sslmode=require`;

describe("choosing a connection string", () => {
  it("prefers our own override over anything a platform injected", () => {
    const picked = resolveDatabaseUrl({
      SOJOURN_DATABASE_URL: "postgresql://ours/db",
      POSTGRES_URL_NON_POOLING: "postgresql://theirs/db",
      DATABASE_URL: "postgresql://conventional/db",
    });
    expect(picked).toEqual({
      url: "postgresql://ours/db",
      from: "SOJOURN_DATABASE_URL",
    });
  });

  it("prefers the direct Vercel variable over its pooled sibling", () => {
    // Both are written by the same integration. Taking the pooled one would
    // work right up until two deploys overlapped.
    const picked = resolveDatabaseUrl({
      POSTGRES_URL: "postgresql://pooled:6543/db",
      POSTGRES_URL_NON_POOLING: "postgresql://direct:5432/db",
    });
    expect(picked?.from).toBe("POSTGRES_URL_NON_POOLING");
  });

  it("falls back to the conventional name for Docker and bare metal", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: SUPABASE })?.from).toBe("DATABASE_URL");
  });

  it("returns null when nothing is set, rather than inventing a default", () => {
    expect(resolveDatabaseUrl({})).toBeNull();
  });

  it("treats blank and whitespace-only as unset", () => {
    // Vercel writes an empty string for a variable defined but left blank; a
    // truthiness check alone would hand "" to the driver and fail obscurely.
    expect(resolveDatabaseUrl({ DATABASE_URL: "", POSTGRES_URL: "   " })).toBeNull();
  });

  it("names the variable it used, so an error can say what to edit", () => {
    expect(URL_VARS).toContain("DATABASE_URL");
    expect(resolveDatabaseUrl({ POSTGRES_URL: SUPABASE })?.from).toBe("POSTGRES_URL");
  });
});

describe("describing a connection out loud", () => {
  it("never prints the password", () => {
    // The single most important assertion in this file: build logs on Vercel
    // are visible to everyone with project access, and a self-hoster's CI
    // output may be public outright.
    const shown = describeConnection(SUPABASE);
    expect(shown).not.toContain(PW);
    expect(shown).not.toContain("postgres:");
  });

  it("still says enough to identify the database", () => {
    expect(describeConnection(SUPABASE)).toBe("db.abcdefgh.supabase.co:5432/postgres");
  });

  it("assumes the default port when one is not given", () => {
    expect(describeConnection("postgresql://u:p@host/mydb")).toBe("host:5432/mydb");
  });

  it("does not throw on a malformed string", () => {
    // A bad connection string should fail at connect time with the driver's
    // message, not while trying to log about it.
    expect(describeConnection("not a url")).toBe("(unparseable connection string)");
  });
});

describe("spotting a transaction pooler", () => {
  it("flags Supabase's port 6543", () => {
    expect(
      looksTransactionPooled("postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres"),
    ).toBe(true);
  });

  it("flags an explicit pgbouncer flag", () => {
    expect(looksTransactionPooled("postgresql://u:p@host:5432/db?pgbouncer=true")).toBe(true);
  });

  it("leaves the session-mode pooler alone", () => {
    // Same host, port 5432 — session pooling keeps the backend for the whole
    // connection, so the advisory lock holds and there is nothing to warn about.
    expect(
      looksTransactionPooled("postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres"),
    ).toBe(false);
  });

  it("leaves a direct connection alone", () => {
    expect(looksTransactionPooled(SUPABASE)).toBe(false);
  });
});

describe("TLS defaults", () => {
  it("defers to the URL when it states an sslmode", () => {
    // The driver maps require/allow/prefer to encrypted-but-unverified, which
    // is what those modes mean in libpq. Overriding would be us second-guessing
    // an explicit instruction.
    expect(sslDefaultFor(SUPABASE)).toBeUndefined();
    expect(sslDefaultFor("postgresql://u:p@h:5432/db?sslmode=disable")).toBeUndefined();
  });

  it("otherwise tries TLS but does not insist", () => {
    // Supabase mandates TLS; a Postgres container next door in a compose file
    // usually has none. "prefer" is the only answer that fits both.
    expect(sslDefaultFor("postgresql://u:p@h:5432/db")).toBe("prefer");
  });
});
