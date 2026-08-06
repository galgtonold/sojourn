// The query side of accent-insensitive search.
//
// Migration 0049 stores the full-text index unaccented, so a query has to be
// unaccented too or the two never meet. Doing it here rather than inside the
// RPCs keeps the change to one small pure function instead of a faithful
// reproduction of two function bodies that were last edited in 0018.
//
// The measured case: "Vrångö" found the story, "Vrango" found nothing. Most of
// the place names in this journal carry a diacritic — Göteborg, Härjedalen,
// Fränkische — and the reader searching for one is usually on a keyboard that
// does not have it, or half-remembers the spelling.

/**
 * Strip diacritics, the way Postgres's `unaccent` dictionary does.
 *
 * NFD splits a letter into its base plus a combining mark, and the marks are
 * then removed: å → a, ö → o, ü → u, é → e. That matches `unaccent` for every
 * character this content actually contains.
 *
 * Deliberately NOT the German transliteration (ö → oe): the stored side uses
 * `unaccent`, and a query normalised by a different rule would miss just as
 * reliably as one not normalised at all. Both sides must agree, and this is the
 * rule they agree on.
 */
export function unaccentQuery(q: string): string {
  return q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
