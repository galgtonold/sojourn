// Apply any migrations this database still owes, then get out of the way.
//
//   node scripts/migrate.mjs [--dry-run]
//
// Runs at the release seam — `npm run build` on Vercel, the entrypoint on
// Docker — so that schema can never silently fall behind the code that expects
// it. Updating the *code* stays a platform gesture (`docker compose pull`, a
// redeploy) because none of the hosts can rebuild themselves; schema is the
// half that can be made automatic safely, because migrations stay additive.
//
// ── What it will and will not fail on ────────────────────────────────────────
//
// It exits non-zero only when it tried something and that thing did not work:
// a migration that errored, or a database it could not reach. Deploying code
// against a schema you know failed to migrate is the bug this exists to stop.
//
// Everything else — no connection string, an unseeded install, a database
// migrated by a newer build than this one — exits 0 with a loud explanation.
// Those are states a human has to resolve, and breaking every build until they
// do would take a working site down over a problem it does not have yet. The
// admin's Updates area is where they surface.
//
// ── Why a Postgres connection at all ─────────────────────────────────────────
//
// Nothing else in Sojourn opens one. The app talks to PostgREST with the anon
// or service-role key, and PostgREST cannot execute DDL — so this is the one
// credential the runner needs and the app does not.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

import {
  assessSchema,
  describeSchema,
  BOOTSTRAP_SQL,
  READ_SQL,
  HAS_SCHEMA_SQL,
  ADVANCE_SQL,
} from "../src/lib/schema-version.mjs";
import {
  resolveDatabaseUrl,
  describeConnection,
  looksTransactionPooled,
  sslDefaultFor,
  URL_VARS,
  MIGRATION_LOCK_KEY,
} from "../src/lib/migrate-config.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const DRY_RUN = process.argv.includes("--dry-run");

const log = (msg) => console.log(`sojourn/migrate  ${msg}`);
const warn = (msg) => console.warn(`sojourn/migrate  ${msg}`);

/**
 * The runner holds ONE session-scoped advisory lock for its whole life, so it
 * needs one connection for its whole life. A pool would take the lock on one
 * backend, run migrations on another and release on a third — which is not
 * locking at all. `max: 1` is correctness here, not tidiness.
 */
function connect(url) {
  return postgres(url, {
    max: 1,
    ssl: sslDefaultFor(url),
    // The runner prints its own progress; the driver's notices are noise.
    onnotice: () => {},
    connection: {
      application_name: "sojourn-migrate",
      // Migrations are atomic per file and roll back cleanly, so a slow one is
      // safe — being killed halfway through a build by an inherited timeout is
      // the more annoying failure. The platform's own build timeout is the
      // real ceiling.
      statement_timeout: "0",
      // But do NOT wait forever on the advisory lock: if another deploy is
      // holding it for two minutes, something is wrong and saying so beats
      // hanging until the build is killed.
      lock_timeout: "120s",
    },
  });
}

/**
 * Vercel and Docker hand the runner real environment variables. A bare-metal
 * checkout keeps them in `.env.local`, which only Next reads — so without this
 * the one host where somebody is most likely to be watching is the one where
 * migrations would quietly skip. Next's own loader, so the files and their
 * precedence are exactly what the app itself will see.
 */
async function loadDotEnvFiles() {
  try {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(ROOT, false, { info: () => {}, error: () => {} });
  } catch {
    // Absent in the Docker runner image, which passes real env vars anyway.
  }
}

async function main() {
  await loadDotEnvFiles();

  const resolved = resolveDatabaseUrl(process.env);
  if (!resolved) {
    warn("no database connection configured — skipping migrations.");
    warn(`  set one of: ${URL_VARS.join(", ")}`);
    warn(
      "  until then the schema will not be kept up to date automatically, and " +
        "new code may meet a database that lacks the columns it expects.",
    );
    return 0;
  }

  log(`${describeConnection(resolved.url)}  (from ${resolved.from})`);
  if (looksTransactionPooled(resolved.url)) {
    warn(
      "this looks like a transaction-mode pooler, where the advisory lock " +
        "cannot hold across migrations — prefer a direct connection " +
        "(POSTGRES_URL_NON_POOLING) if concurrent deploys are possible.",
    );
  }

  const sql = connect(resolved.url);
  let locked = false;
  try {
    await sql.unsafe(`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`);
    locked = true;

    // Before anything is decided: the runner's own bookkeeping table. It is not
    // a migration, because a migration that creates the table the runner reads
    // to choose migrations cannot be applied by that runner.
    await sql.unsafe(BOOTSTRAP_SQL).simple();

    const [row] = await sql.unsafe(READ_SQL);
    const [{ present }] = await sql.unsafe(HAS_SCHEMA_SQL);
    const state = assessSchema({
      watermark: row?.last_applied ?? null,
      hasExistingSchema: Boolean(present),
    });

    const pending = "pending" in state ? state.pending : [];
    if (pending.length === 0) {
      // `current` is the everyday case; `unseeded` and `unknown` both need a
      // human and are the reason describeSchema explains itself at length.
      (state.kind === "current" ? log : warn)(describeSchema(state));
      return 0;
    }

    log(describeSchema(state));

    // Read every file up front. A missing one means the build was packaged
    // wrong — the Docker image forgot the .sql files, say — and finding that
    // out after applying half of them would be the worst possible time.
    const files = pending.map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"),
    }));

    if (DRY_RUN) {
      for (const { name } of files) log(`  would apply  ${name}`);
      return 0;
    }

    for (const { name, sql: text } of files) {
      const started = Date.now();
      try {
        await sql.begin(async (tx) => {
          // The simple protocol, because a migration is many statements and
          // they cannot be split on ";" — nine of these files define functions
          // whose $$-quoted bodies are full of them.
          await tx.unsafe(text).simple();
          // Advancing the watermark inside the migration's own transaction is
          // what makes this recoverable: Postgres has transactional DDL, so
          // "applied but not recorded" and "recorded but not applied" are
          // unreachable rather than states to repair.
          await tx.unsafe(ADVANCE_SQL, [name]);
        });
      } catch (err) {
        warn(`  FAILED       ${name}`);
        for (const line of describeSqlError(err)) warn(`               ${line}`);
        warn(
          "stopping here. This file rolled back whole; the watermark still " +
            "names the last one that succeeded, so re-running after a fix " +
            "resumes from exactly this migration.",
        );
        return 1;
      }
      log(`  applied      ${name}  (${Date.now() - started}ms)`);
    }

    log(`done — ${files.length} migration(s) applied`);
    return 0;
  } finally {
    if (locked) {
      await sql
        .unsafe(`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`)
        .catch(() => {});
    }
    await sql.end({ timeout: 5 });
  }
}

/** Postgres errors carry the useful part in fields, not in `message`. */
function describeSqlError(err) {
  const lines = [];
  if (err?.code) lines.push(`${err.code}: ${err.message}`);
  else lines.push(String(err?.message ?? err));
  for (const field of ["detail", "hint", "where"]) {
    if (err?.[field]) lines.push(`${field}: ${err[field]}`);
  }
  return lines;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  // Anything that got here is a connection or bookkeeping failure, not a
  // migration failure — the loop above handles those and returns 1 itself.
  warn("could not migrate:");
  for (const line of describeSqlError(err)) warn(`  ${line}`);
}
process.exit(code);
