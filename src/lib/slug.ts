import { transliterate } from "transliteration";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlaceholderSlug } from "@/lib/utils";

/**
 * Slug derivation. Lives in its own module, not `utils.ts`, on purpose: it pulls
 * in a ~190KB transliteration table, and `utils.ts` is imported by client
 * components for `cn()`. Only the API routes import this — the admin editors
 * send the slug the author typed (or an empty string) and let the server derive
 * the rest, so the table never reaches the browser bundle.
 */

/** Highest codepoint the transliteration table passes through untouched. */
const MAX_ASCII = 0x7f;

/**
 * Retry any character the transliteration table drops using its lowercase form.
 *
 * The table is keyed on the exact codepoint, and for a handful of letters only
 * the lowercase variant has an entry — most importantly `ẞ` (U+1E9E, capital
 * sharp s), which is plain German the moment a title is set in caps: "STRAẞE"
 * transliterated as-is loses the letter entirely and yields `strae`.
 *
 * Lowercasing the whole string before transliterating is the obvious move and
 * is *wrong* — the table keys ~58 phonetic letters on their uppercase form
 * only, so that fixes 13 characters and breaks 58. Applying the lowercase form
 * per character, and only where the primary pass already produced nothing,
 * fixes the same 13 with no regressions. Unicode's own case mapping does the
 * work; there is no hand-written character list here to fall out of date.
 */
function rescueDropped(input: string): string {
  let hasNonAscii = false;
  for (const ch of input) {
    if (ch.codePointAt(0)! > MAX_ASCII) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) return input;

  return [...input]
    .map((ch) => {
      if (ch.codePointAt(0)! <= MAX_ASCII || transliterate(ch) !== "") return ch;
      const lower = ch.toLowerCase();
      return lower !== ch && transliterate(lower) !== "" ? lower : ch;
    })
    .join("");
}

/**
 * A URL-safe slug from arbitrary text.
 *
 * NFKD alone — what this used to do — only decomposes letters Unicode defines a
 * decomposition for. Stroked and ligature letters have none, because Danish
 * treats `ø` as its own letter rather than an `o` wearing a mark, so they fell
 * through to the `[^a-z0-9]` bucket and became hyphens. For a travel journal
 * that is precisely the wrong alphabet to lose: `Ærøskøbing` slugged to
 * `r-sk-bing` and `Straße` to `stra-e`. Transliteration handles every script
 * instead, so `北海道` is `bei-hai-dao` rather than nothing at all.
 *
 * Returns "" when the input has no transliterable content (punctuation, or the
 * few letters with no ASCII equivalent). Callers must supply their own fallback
 * — `slug` is `not null unique` on both tables, and "" satisfies that exactly
 * once before the next insert collides.
 */
export function slugify(input: string): string {
  return (
    transliterate(rescueDropped(input))
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80)
      // The cap can land mid-word and leave the hyphen that preceded it.
      .replace(/-+$/, "")
  );
}

/**
 * Decide the slug to store, given what the caller asked for and what is left to
 * fall back on. Every create and update route runs this, so the precedence is
 * in one place rather than re-spelled four times:
 *
 *   1. the slug the author chose, unless it is one this API minted;
 *   2. a slug derived from the title;
 *   3. the caller's fallbacks in order — the record's current slug on an update,
 *      a freshly minted placeholder on a create.
 *
 * The last step is not optional. `slug` is `not null unique` on both tables and
 * `slugify` legitimately returns "" (a punctuation-only title, or a script with
 * no ASCII equivalent). An empty string satisfies not-null, so without a
 * fallback the first such record takes a dead URL and the second one 500s on
 * the unique index — which is exactly what the trips routes used to do.
 */
export function resolveSlug(
  requested: string | null | undefined,
  title: string,
  ...fallbacks: (string | null | undefined)[]
): string {
  if (requested && !isPlaceholderSlug(requested)) return requested;
  const derived = slugify(title);
  if (derived) return derived;
  return fallbacks.find((candidate) => !!candidate) ?? "";
}

/** How many numbered variants `freeSlug` tries before giving up. */
const MAX_SLUG_SUFFIX = 50;

/**
 * The base slug and its numbered variants, in the order they are tried:
 * `base`, `base-2`, `base-3`, … Each stays within slugify's 80-character cap,
 * trimming the base rather than the number.
 */
export function slugCandidates(base: string): string[] {
  const out = [base];
  for (let n = 2; n <= MAX_SLUG_SUFFIX; n++) {
    const suffix = `-${n}`;
    out.push(`${base.slice(0, 80 - suffix.length).replace(/-+$/, "")}${suffix}`);
  }
  return out;
}

/**
 * Make a slug that was *derived from a title* unique on its table.
 *
 * Two records can easily want the same title-derived slug: rename a published
 * post and its slug stays put (it is part of a live URL), so the old title's
 * slug is still taken when the next post is given that title. The update then
 * hits `posts_slug_key`, PostgREST answers 409, and every save of that post
 * fails — the author keeps editing, opens the preview, sees the old text, and
 * loses the edit on reload. Only derived slugs are moved; one the author typed
 * is kept as is, so a real conflict there still surfaces.
 *
 * RLS can hide rows from this lookup (a collaborator does not see every draft),
 * so the unique index stays the last word; this only removes the common case.
 */
export async function freeSlug(
  supabase: SupabaseClient,
  table: "posts" | "trips",
  slug: string,
  selfId?: string,
): Promise<string> {
  if (!slug) return slug;
  const candidates = slugCandidates(slug);
  let query = supabase.from(table).select("slug").in("slug", candidates);
  if (selfId) query = query.neq("id", selfId);
  const { data, error } = await query;
  if (error || !data) return slug;
  const taken = new Set(data.map((row: { slug: string }) => row.slug));
  return candidates.find((candidate) => !taken.has(candidate)) ?? slug;
}

/** True when `resolveSlug` will keep the caller's slug rather than derive one. */
export function isChosenSlug(requested: string | null | undefined): boolean {
  return !!requested && !isPlaceholderSlug(requested);
}
