// Query expansion for the full-text side of search. The text index uses the
// 'simple' config (no stemming — the content is bilingual), so "Fahrrad" won't
// match a post that says "Rad" or "bike". These curated groups map a search word
// to its synonyms/translations/surface-forms; a query word in a group is OR'd
// with the whole group so e.g. "Fahrrad" finds every cycling post regardless of
// which word it used. Only known words expand — nonsense matches nothing, so
// this can't reintroduce over-matching.
const SYNONYM_GROUPS: string[][] = [
  // cycling
  ["fahrrad", "fahrräder", "rad", "räder", "radeln", "radtour", "radweg",
   "bike", "bikes", "biking", "bicycle", "cycling", "cyclist", "velo"],
  // glacier / ice
  ["gletscher", "glacier", "glaciers", "eis", "ice"],
  // mountains
  ["berg", "berge", "gebirge", "mountain", "mountains", "gipfel", "summit",
   "peak", "peaks"],
  // hiking
  ["wandern", "wanderung", "wanderweg", "hike", "hiking", "trek", "trekking",
   "trail", "trails"],
  // canal / locks
  ["schleuse", "schleusen", "lock", "locks", "kanal", "canal"],
  // snow
  ["schnee", "snow", "snowy", "schneebedeckt"],
  // sea / coast
  ["meer", "ozean", "küste", "sea", "ocean", "coast", "coastal", "beach",
   "strand"],
  // sunrise / sunset
  ["sonnenaufgang", "sunrise", "dawn", "sonnenuntergang", "sunset", "dusk"],
  // autumn / maple
  ["herbst", "autumn", "fall", "ahorn", "maple"],
];

const LOOKUP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const w of group) LOOKUP.set(w, group);
}

// Keep only tsquery-safe lexeme characters (letters incl. umlauts, digits).
function lexeme(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]/gi, "");
}

/**
 * Build a `tsquery` string that ANDs the query words but expands any word that
 * has synonyms into an OR-group. Returns null when nothing expands, so the RPC
 * falls back to its default `websearch_to_tsquery` (which understands quotes /
 * OR / negation for power users).
 */
export function buildExpandedTsQuery(query: string): string | null {
  const words = query
    .split(/\s+/)
    .map(lexeme)
    .filter((w) => w.length >= 2);
  if (words.length === 0 || !words.some((w) => LOOKUP.has(w))) return null;

  const parts = words.map((w) => {
    const group = LOOKUP.get(w);
    if (!group) return w;
    const terms = Array.from(new Set([w, ...group])).filter(Boolean);
    return `(${terms.join(" | ")})`;
  });
  return parts.join(" & ");
}
