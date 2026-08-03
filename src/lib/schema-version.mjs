// @ts-check
// Where a given database sits in the migration order, and what it still owes.
//
// See docs/adr/0002-updates-and-schema-migrations.md. The watermark names the
// last file from ./migrations.mjs that this database has applied. Everything
// after it in that list is owed.
//
// The bookkeeping table is created by the RUNNER, not by a migration. A
// migration that creates the table the runner reads to decide which migrations
// to run cannot be applied by that runner — so this DDL sits outside the
// sequence entirely and is run before anything is decided.
//
// Plain ESM rather than TypeScript for the same reason as ./migrations.mjs:
// scripts/migrate.mjs has to load it on hosts with no toolchain.

import { MIGRATIONS, latestMigration, pendingAfter } from "./migrations.mjs";

export const WATERMARK_TABLE = "sojourn_schema";

/**
 * Idempotent, and safe to run on every boot.
 *
 * The explicit revoke is belt-and-braces: 00271 already revoked the default
 * grants that would otherwise reach a newly created table, but this row records
 * how far the schema has been migrated and there is no reading of the app in
 * which a visitor needs it.
 */
export const BOOTSTRAP_SQL = `
create table if not exists public.${WATERMARK_TABLE} (
  id           smallint primary key default 1 check (id = 1),
  last_applied text        not null,
  updated_at   timestamptz not null default now()
);
revoke all on public.${WATERMARK_TABLE} from anon, authenticated;
`.trim();

/** One row, or none if this database has never been seeded. */
export const READ_SQL = `select last_applied from public.${WATERMARK_TABLE} where id = 1;`;

/** Whether the bookkeeping table exists at all. */
export const EXISTS_SQL = `select to_regclass('public.${WATERMARK_TABLE}') is not null as present;`;

/**
 * Does this database already carry Sojourn's schema?
 *
 * `posts` is the probe because it arrives in 0001 and never leaves. It is what
 * separates "brand new database" from "install that predates the watermark",
 * which look identical from the watermark alone and want opposite treatment.
 */
export const HAS_SCHEMA_SQL = `select to_regclass('public.posts') is not null as present;`;

/**
 * Record a file as applied. Runs INSIDE the same transaction as the migration
 * itself — Postgres has transactional DDL, so "applied but not recorded" and
 * "recorded but not applied" are both unreachable states rather than things the
 * runner has to recover from.
 */
export const ADVANCE_SQL = `
insert into public.${WATERMARK_TABLE} (id, last_applied, updated_at)
values (1, $1, now())
on conflict (id) do update
  set last_applied = excluded.last_applied, updated_at = now();
`.trim();

/**
 * @typedef {{ kind: "fresh", pending: string[] }} FreshSchema
 *   Empty database. The whole manifest is owed.
 * @typedef {{ kind: "current", watermark: string, pending: [] }} CurrentSchema
 *   Seeded and up to date.
 * @typedef {{ kind: "behind", watermark: string, pending: string[] }} BehindSchema
 *   Seeded and behind.
 * @typedef {{ kind: "unseeded" }} UnseededSchema
 *   Schema present, watermark absent — an install from before this existed.
 * @typedef {{ kind: "unknown", watermark: string }} UnknownSchema
 *   Watermark names a migration this build does not have.
 * @typedef {FreshSchema | CurrentSchema | BehindSchema | UnseededSchema | UnknownSchema} SchemaState
 */

/**
 * Decide what a database owes. Pure, so the decision is testable without one.
 *
 * Two of the five outcomes deliberately carry no work and require a human:
 *
 * `unseeded` — schema exists but nothing recorded which migrations produced it.
 * Treating that as `fresh` replays 0001_init, which creates policies rather than
 * `create ... if not exists`, against live data. Treating it as `current` means
 * genuine migrations never run on that database again. Neither is a guess worth
 * making, so it is seeded once, deliberately, against verified evidence.
 *
 * `unknown` — the watermark names something absent from this build, which
 * happens when the app is rolled back to an older version than the database.
 * The database is ahead; running anything would be running it twice.
 *
 * @param {{ watermark: string | null, hasExistingSchema: boolean }} opts
 * @returns {SchemaState}
 */
export function assessSchema(opts) {
  const { watermark, hasExistingSchema } = opts;

  if (watermark === null) {
    return hasExistingSchema
      ? { kind: "unseeded" }
      : { kind: "fresh", pending: [...MIGRATIONS] };
  }

  if (!MIGRATIONS.includes(watermark)) {
    return { kind: "unknown", watermark };
  }

  if (watermark === latestMigration()) {
    return { kind: "current", watermark, pending: [] };
  }

  return { kind: "behind", watermark, pending: pendingAfter(watermark) };
}

/**
 * A one-line account of the state, for build logs and the admin.
 * @param {SchemaState} state
 * @returns {string}
 */
export function describeSchema(state) {
  switch (state.kind) {
    case "fresh":
      return `empty database — applying all ${state.pending.length} migrations`;
    case "current":
      return `schema is current (${state.watermark})`;
    case "behind":
      return `${state.pending.length} migration(s) to apply after ${state.watermark}`;
    case "unseeded":
      return (
        "this database has Sojourn's schema but no migration watermark, so " +
        "there is no safe way to tell what it still owes — seed it once (see " +
        "docs/adr/0002-updates-and-schema-migrations.md)"
      );
    case "unknown":
      return (
        `the database was migrated by a newer build than this one ` +
        `(${state.watermark} is not in this release) — deploy that version or newer`
      );
  }
}
