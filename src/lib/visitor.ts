"use client";
// The anonymous reader's whole identity, in one place.
//
// This id decides whose reaction is toggled, whose vote is counted and who gets
// a reply notification. It was implemented three times — here, in reactions.tsx
// and in interactive-block.tsx — byte-identical, all three reading the literal
// "sojourn:vid". Three copies is three places to change if the key, the format
// or the storage medium ever moves, and a missed one silently splits one reader
// into two.
//
// It is also the value the database will not hand back. `visitor_token` is
// column-scoped away from anon on comments, reactions and comment_likes
// (0043, 0048) precisely because one stable id across all four features
// correlates everything a person has ever done on the site. It is fine for this
// browser to know its own; it is not fine for anyone to be able to ask.
const VID_KEY = "sojourn:vid";

export function visitorToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(VID_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(VID_KEY, t);
  }
  return t;
}

/**
 * Read a JSON array of strings out of localStorage, or nothing.
 *
 * The callers used to do `JSON.parse(stored)` bare, inside a useEffect. Corrupt
 * storage throws SyntaxError; a stored scalar throws "number is not iterable"
 * from the Set constructor — and either escapes to the nearest error boundary
 * and takes out the comments section or the reactions block, on a page the
 * visitor can only repair by clearing site data they do not know exists.
 *
 * push-sync.ts already did this correctly. This is that pattern, reused.
 */
export function readStringSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}
