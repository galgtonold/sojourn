// Where this deployment's database actually is, read at runtime.
//
// scripts/migrate.mjs answers the same question at the release seam, from a
// direct Postgres connection. This asks it again from inside the running app,
// through PostgREST, for one reason: to notice when the runner never got to.
//
// Per ADR-0002 the admin shows versions, not migrations — except on failure,
// "because that state is real, is currently invisible, and does need a human".
// This is what makes it visible.

import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { assessSchema, WATERMARK_TABLE } from "@/lib/schema-version.mjs";
import type { SchemaState } from "@/lib/schema-version.mjs";

export type SchemaReport =
  /** The watermark was read and compared to this build's manifest. */
  | { kind: "known"; state: SchemaState }
  /**
   * No service-role key, so there is no way to read it. Worth its own state
   * rather than folding into an error: the app runs fine without that key, so
   * this is a gap in what the admin can *tell* you, not a broken install.
   */
  | { kind: "no-key" }
  /**
   * The bookkeeping table does not exist, which means the runner has never
   * completed here — no connection string configured, or it failed before it
   * got that far. The single most likely reading of a self-hoster whose schema
   * is quietly behind.
   */
  | { kind: "never-run" }
  /** Something else went wrong; show it rather than guess. */
  | { kind: "error"; message: string };

/** Postgres "undefined_table", and PostgREST's own "not in the schema cache". */
const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST202"]);

export async function readSchemaReport(): Promise<SchemaReport> {
  const admin = getAdminSupabase();
  if (!admin) return { kind: "no-key" };

  const { data, error } = await admin
    .from(WATERMARK_TABLE)
    .select("last_applied")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (MISSING_TABLE.has(error.code ?? "")) return { kind: "never-run" };
    return { kind: "error", message: error.message };
  }

  const watermark =
    (data as { last_applied?: string } | null)?.last_applied ?? null;

  // The table exists, so the runner has been here. A missing row therefore
  // means an install that predates the watermark rather than an empty database
  // — which is exactly the distinction assessSchema refuses to guess at, and
  // why it is handed `true` here: anything running this code has a schema.
  return {
    kind: "known",
    state: assessSchema({ watermark, hasExistingSchema: true }),
  };
}

/**
 * Is this something the operator needs to act on?
 *
 * `behind` is the one that looks alarming but is not: the runner applies
 * pending migrations at the next build or container start, so it resolves
 * itself. It only becomes a problem if it persists — which is what the page
 * says rather than raising an alarm the operator cannot act on.
 */
export function schemaNeedsAttention(report: SchemaReport): boolean {
  if (report.kind === "known") {
    return report.state.kind === "unseeded" || report.state.kind === "unknown";
  }
  return report.kind === "never-run" || report.kind === "error";
}
