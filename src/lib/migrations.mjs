// @ts-check
// The order migrations are applied in — declared, not inferred.
//
// See docs/adr/0002-updates-and-schema-migrations.md. The short version: the
// runner needs to know what a given database still owes, and neither the
// filesystem nor Supabase's ledger can tell it.
//
// Filenames cannot, because they do not sort into the order they ran:
//   lexical:  00271_tighten… before 0027_photo…   ("1" precedes "_")
//   numeric:  00271_tighten… LAST                 (read as 271)
// Both are wrong in different directions, and the numeric one contradicts the
// two databases that have already run these. The 00271 name is itself a repair
// — it resolved a duplicate 0027 that broke `supabase db reset` — and renaming
// it again would rewrite history for files that have already been applied.
//
// Supabase's ledger cannot either, because production records these by
// timestamp (20260603110646 init_schema) while the repo names them 00NN. The
// namespaces do not overlap at all, so comparing files to ledger rows concludes
// that everything is pending and replays 0001_init against live data.
//
// So: this list is the truth, a watermark names the last file a database has
// applied, and everything after it is owed. A test asserts the list and the
// directory agree, because the failure it prevents is silent — add a migration,
// forget the list, and it simply never runs.
//
// ── Why this file is .mjs and not .ts ────────────────────────────────────────
//
// scripts/migrate.mjs runs in two places that have no TypeScript: Vercel's
// build step, and the Docker runner stage, which contains `.next/standalone`
// and nothing else — no source, no toolchain. Plain ESM is the only thing both
// the app and the runner can load, so the runner executes *this* logic rather
// than a second copy of it that could quietly drift. Getting these decisions
// wrong replays DDL against live data, which is not a risk worth a duplicate.
// The JSDoc types are checked by `tsc --noEmit` via `allowJs` + `@ts-check`.

/** @type {readonly string[]} */
export const MIGRATIONS = [
  "0001_init.sql",
  "0002_push_audience.sql",
  "0003_alt_likes_moderation.sql",
  "0004_gpx_tracks.sql",
  "0005_interactions.sql",
  "0006_collaborators.sql",
  "0007_harden_functions.sql",
  "0008_ai_enrichment.sql",
  "0009_ai_usage.sql",
  "0010_hybrid_search.sql",
  "0011_ai_jobs.sql",
  "0012_site_settings.sql",
  "0013_content_i18n.sql",
  "0014_search_distance_threshold.sql",
  "0015_search_tsv_i18n.sql",
  "0016_post_chunks.sql",
  "0017_search_posts_chunked.sql",
  "0018_search_tsquery_expansion.sql",
  "0019_member_invites.sql",
  "0020_api_role_grants.sql",
  "0021_push_user.sql",
  "0022_interaction_source.sql",
  "0023_branding.sql",
  "0024_branding_hero.sql",
  "0025_branding_per_language.sql",
  "0026_restrict_unpublished_geo.sql",
  // Applied here on both live databases, seconds after 0026 — see the ADR.
  "00271_tighten_anon_grants.sql",
  "0027_photo_capture_offset.sql",
  "0028_comment_author_token.sql",
  "0029_photo_media_type.sql",
  "0030_photo_manual_order.sql",
  "0031_translation_error.sql",
  "0032_ai_usage_outcome.sql",
  "0033_photo_nearby_places.sql",
  "0034_post_place_index.sql",
  "0035_post_ai_drafts.sql",
  "0036_scope_anon_columns.sql",
  "0037_app_secrets.sql",
  "0038_first_run_setup.sql",
  "0039_setup_window.sql",
  "0040_missing_ai_columns.sql",
  "0041_analytics_setting.sql",
  "0042_update_check.sql",
  "0043_authenticated_is_not_a_trust_boundary.sql",
  "0044_ai_usage_diagnostics.sql",
  "0045_ai_usage_transparency.sql",
  "0046_scope_anonymous_deletes.sql",
  "0047_shared_rate_limits.sql",
];

/**
 * The last entry — what a fully up-to-date database's watermark should read.
 * @returns {string}
 */
export function latestMigration() {
  return MIGRATIONS[MIGRATIONS.length - 1];
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isKnownMigration(name) {
  return MIGRATIONS.includes(name);
}

/**
 * Everything a database still owes, given the last migration it applied.
 *
 * `null` means "nothing has ever been applied" — a genuinely empty database,
 * where the whole list is owed.
 *
 * An unrecognised watermark THROWS rather than defaulting. The alternative
 * readings are both dangerous: treat it as null and the runner replays history
 * against live data; treat it as up-to-date and real migrations are skipped
 * forever. "I do not know where this database is" is not a state to guess at.
 *
 * @param {string | null} applied
 * @returns {string[]}
 */
export function pendingAfter(applied) {
  if (applied === null) return [...MIGRATIONS];
  const at = MIGRATIONS.indexOf(applied);
  if (at === -1) {
    throw new Error(
      `unknown migration in watermark: ${applied}. The database claims to have ` +
        `applied a migration this build has never heard of — refusing to guess ` +
        `what it still owes.`,
    );
  }
  return MIGRATIONS.slice(at + 1);
}
