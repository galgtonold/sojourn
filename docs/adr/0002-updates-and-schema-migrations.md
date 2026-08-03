# ADR-0002: Updates are a platform gesture; migrations run themselves

## Status
Accepted — 2026-08-03

Implemented: the manifest (`src/lib/migrations.mjs`), the watermark
(`src/lib/schema-version.mjs`, seeded on production and the demo) and the runner
(`scripts/migrate.mjs`, wired into `npm run build` and the Docker `CMD`).
Outstanding: the Updates area in the admin, and GHCR images for the Docker
update path.

## Context

Sojourn is meant to be self-hosted, largely by people who are not going to run a
terminal to keep it current. Today it has no update story at all: no version a
human can read, no signal that a newer one exists, and a schema that drifts
silently behind the code the moment anyone deploys.

That drift is not hypothetical. Two migrations the app depends on
(`trips.ai_context`, `tracks.started_at`) existed only on the author's database,
added by hand outside the migration history. Every fresh install therefore had
an editor whose trip pages returned 404, with nothing anywhere pointing at the
schema as the cause. A third (`analytics_provider`) would have 500'd the
settings page had it not been applied by hand first. The failure mode is always
the same: new code, old database, no error that names the problem.

### Why the app cannot update itself

The obvious answer — a button in the admin that updates Sojourn — does not
survive contact with what we actually ship.

The Docker runner image, which is also the documented VPS path, contains
`.next/standalone` and nothing else: no source, no build toolchain. There is
literally nothing for it to rebuild from. It also runs as `USER nextjs`, so it
could not write to its own files if the source were there. Replacing the image
means talking to the Docker daemon, which means mounting the Docker socket —
root-equivalent on the host. Watchtower does exactly that and is deliberately a
separate, opt-in container; granting that power to a personal journal turns one
content-injection bug into host compromise.

On Vercel the filesystem is read-only and serverless. The app could ask GitHub
to sync the operator's fork (the push then triggers their existing auto-deploy),
but that requires a repo-scoped GitHub token stored in their database — a
significant new secret for a personal site to hold, and a new thing to leak.

A bare-metal checkout could genuinely `git pull && npm ci && build && restart`.
It is also the worst case to attempt: Next builds are memory-hungry and would
OOM on a small VPS, the site is down or stale for minutes, a failed build leaves
no way back, and the app needs write access to its own code. Ghost is the useful
precedent — it *does* have one-command updates, but from a separate CLI process.
The updater should not be the thing being updated.

### What the projects that self-host well actually do

WordPress and Nextcloud do in-app one-click updates because they are interpreted
languages on a writable filesystem. We are not in that category. The projects we
resemble — Ghost, Gitea, Plausible, Miniflux, Discourse — all converge on the
same three behaviours: update is a platform gesture, **migrations run themselves
as part of the release**, and the app reports its version and stays out of it.

Notably, the one-click already exists on every host we support. It just isn't in
our admin: `docker compose pull && up -d`, or GitHub's "Sync fork" button.

## Decision

**Updating code stays a platform gesture. Applying schema becomes automatic.
The admin's job is to tell you when to act and to be loud when it could not.**

### 1. Migrations apply at the release seam, not on a button

An admin button that says "3 migrations pending" lights up exactly when the site
is already broken, and asks a question the operator has no basis to answer —
they consented to the migration when they deployed the version that contains it.

"At boot" means different things per host, so the seam differs:

| Host | Seam | Why |
| --- | --- | --- |
| Vercel | build step | No boot exists; every invocation cold-starts. One build = one deploy = one run. |
| Docker | entrypoint, before `server.js` | One container start, one run. |

Both take a Postgres advisory lock, so replicas and concurrent builds cannot
race. Each migration runs in its own transaction, and the runner **stops at the
first failure** rather than continuing — a half-applied schema is worse than an
unapplied one.

### 2. Position drives the runner; version is what humans see

Two different questions deserve two different answers:

- *What does the operator need to know?* "You are on 0.0.6, 0.1.5 is available."
- *What does the runner need to know?* "Applied through entry 41; run 42–45."

So the app keeps its **own ordered manifest** of migrations and a `schema_version`
watermark pointing at a position in it.

This deliberately does **not** consult `supabase_migrations.schema_migrations`.
That ledger records the author's production migrations by timestamp
(`20260802184210 analytics_setting`) while the repo names them `0001_init` …
`0041_analytics_setting`. The namespaces do not overlap at all, so any runner
comparing files-on-disk to ledger-rows would conclude every migration is pending
and try to replay `0001_init` — which contains non-idempotent `create policy`
statements — against a live database. Keeping our own watermark sidesteps the
reconciliation entirely.

An explicit manifest also removes any dependency on filename sorting, which is
already unreliable: `00271_tighten_anon_grants.sql` sorts *before*
`0027_photo_capture_offset.sql`, because `1` precedes `_`. The list is the
order. No renumbering, no rewriting the names of files that have already run on
real databases.

### 3. The admin shows versions, never migrations — except on failure

Migrations are an implementation detail of a release. The operator's question is
"is my site current and working", not "which DDL is outstanding", and a list of
migration names is not something they can act on.

So the Updates area shows the running version, whether a newer release exists,
and the update recipe **for the detected host** (we already detect Vercel via
`process.env.VERCEL`). Migrations appear only when they did not apply — because
that state is real, is currently invisible, and does need a human.

The most likely cause of that is a self-hoster with no `SUPABASE_SERVICE_ROLE_KEY`
configured; it is optional today, and without it nothing can migrate on their
behalf. Manual application becomes the recovery path, not the routine one.

### 4. Migrations stay additive and backwards-compatible

What makes automatic application safe rather than brave is that old code meeting
new schema — and vice versa, for the seconds either can occur — is harmless.
Destructive changes get the expand/contract treatment across two releases.

## Consequences

- The schema can no longer silently fall behind the code on any supported host.
  The class of bug that produced the trip-editor 404 stops being possible.
- **Seeding the watermark is the one delicate step.** Production and the demo
  already carry applied schema recorded under a different ledger. Each existing
  database needs its watermark set once, by hand, to where it actually is. Too
  low and the runner replays migrations against live data. This is done per
  database, verified against a copy first, and never against production directly.
- Releases need real tags. The version today is a 12-character commit SHA
  (`NEXT_PUBLIC_SW_VERSION`, visible at `/api/health`) — not orderable and
  meaningless to a reader. `v0.1.0` is a prerequisite, not a follow-up.
- Docker gains an update path only once images are published to GHCR with
  `:latest` and `:vX.Y.Z`. `docker-compose.yml` currently builds from source, so
  there is nothing to `pull`.
- Checking GitHub for a newer release is an outbound request from someone's
  private journal. Nothing about them is sent, so it is not telemetry — but it
  deserves the same honesty as ADR-adjacent telemetry work and an off switch.
- **Revisit** if Sojourn ever ships a first-party hosted offering, where the
  platform gesture and the app are the same operator and a genuine one-click
  update becomes both possible and expected.

## Alternatives considered

**A "3 migrations pending — Apply" button as the primary mechanism.** Rejected:
it can only appear once the site is already serving against a schema it does not
expect, and it presents as a choice something the operator cannot evaluate.
Retained solely as the recovery path when automation was impossible.

**Reconciling our filenames with `supabase_migrations.schema_migrations`.**
Rejected as unnecessary once the watermark is ours. It would mean a one-time
per-database mapping between two disjoint naming schemes, with a replay of
history as the failure mode.

**Renumbering the migration files so they sort correctly.** Rejected: an
explicit manifest makes sort order irrelevant, and renaming files that have
already run on real databases rewrites history for no gain.

**Auto-updating code, not just schema.** Rejected. A broken update on a personal
journal nobody is monitoring is worse than being a version behind — the reason
WordPress auto-applies only minor releases. Schema is additive and safe;
code is deliberate.
