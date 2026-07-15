// The app_secrets security model is "RLS on, no policies" — the table is
// unreachable through PostgREST and only the service role can read it. There is
// no live-DB test harness here, so this guards the invariant at the source: if
// someone adds a policy to this table, this fails and they have to come read the
// comment explaining why they must not.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase/migrations");

describe("app_secrets migration", () => {
  const sql = readdirSync(DIR)
    .filter((f) => f.includes("app_secrets"))
    .map((f) => readFileSync(join(DIR, f), "utf8"))
    .join("\n");

  it("exists", () => {
    expect(sql).toContain("create table if not exists public.app_secrets");
  });

  it("enables RLS", () => {
    expect(sql).toContain("alter table public.app_secrets enable row level security");
  });

  it("declares no policy on app_secrets", () => {
    expect(sql).not.toMatch(/create\s+policy[\s\S]*?on\s+public\.app_secrets/i);
  });

  it("revokes grants from anon and authenticated", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.app_secrets\s+from\s+anon,\s*authenticated/i);
  });
});
