// What an export contains, and what it deliberately does not.
//
// Pure, so the decisions below are reachable from a test without a database.

/**
 * The tables an export carries, in an order that can be re-inserted top-down:
 * a row is only written after whatever it points at.
 *
 * This is a whitelist rather than "every table", because the interesting
 * question is not what exists but what should travel. Adding a table to the
 * schema does not automatically make it content — and a test fails when the
 * database grows a table nobody has classified, so the decision gets made once,
 * deliberately, instead of being discovered as a gap during a restore.
 */
export const EXPORTED_TABLES = [
  "site_settings",
  "trips",
  "posts",
  "locations",
  "photos",
  "tracks",
  "interactions",
  "comments",
  "reactions",
  "comment_likes",
  "interaction_responses",
] as const;

/**
 * Tables that exist and are deliberately left out, with the reason. Anything in
 * the schema must appear in exactly one of these two lists.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  // Both hang off auth.users, which an export cannot carry — the app reads
  // through PostgREST and Supabase's auth schema is not exposed there. Importing
  // them would reference accounts that do not exist on the new host and fail the
  // foreign key on the first row. Nothing in the content graph points at them,
  // so leaving them out costs nothing but the collaborator list, which is
  // rebuilt by inviting people again.
  profiles: "tied to auth.users, which no export can carry",
  trip_members: "tied to auth.users; re-invite collaborators on the new host",
  // Secrets, not content. An export is a file people email themselves.
  app_secrets: "holds credentials — never leaves the instance",
  member_invites: "single-use tokens; stale ones are worse than none",
  // Endpoints bound to one browser on one origin. Restored elsewhere they are
  // undeliverable at best and someone else's device at worst.
  push_subscriptions: "browser endpoints, meaningless on another host",
  notifications: "derived from content, and rebuilt as it arrives",
  // Counters, not content — and stale ones on a new host would throttle its
  // first visitors for no reason.
  rate_limits: "throttling counters, meaningless on another host",
  // Working state of the AI pipeline. Large, uninteresting, regenerable.
  ai_jobs: "transient queue",
  ai_usage: "a cost meter, not content",
  post_ai_drafts: "scratch drafts kept for one editing session",
  post_chunks: "search index, rebuilt from the posts themselves",
};

export type ExportManifest = {
  /** Bumped when the archive layout changes in a way an importer must notice. */
  formatVersion: number;
  /** The Sojourn that wrote it, so an importer can refuse a newer one. */
  sojournVersion: string;
  createdAt: string;
  siteName: string;
  tables: Record<string, number>;
  photos: { files: number; bytes: number; missing: string[] };
  /** Spelled out in the archive itself, where someone reading it will look. */
  notIncluded: Record<string, string>;
};

export const EXPORT_FORMAT_VERSION = 1;

/**
 * Can this Sojourn read that archive?
 *
 * Older is fine — the layout only ever gains things. Newer is refused: an
 * archive written by a later version may contain tables or columns this one
 * would silently drop, and a half-imported journal is worse than a refusal.
 */
export function canImport(formatVersion: number): boolean {
  return Number.isInteger(formatVersion) && formatVersion > 0
    ? formatVersion <= EXPORT_FORMAT_VERSION
    : false;
}

/** `sojourn-export-2026-08-04.zip` — sorts chronologically, reads as a date. */
export function exportFilename(at: Date): string {
  const iso = at.toISOString();
    return `sojourn-export-${iso.slice(0, 10)}-${iso.slice(11, 16).replace(":", "")}.zip`;
}
