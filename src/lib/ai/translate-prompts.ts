// The translation contract: what we ask the model for, and which language we
// think a piece of writing is already in.
//
// Two runtimes do this work. The `translate` Edge Function runs it on Supabase,
// off Vercel's request clock; `translate-run.ts` runs it inside the Next server
// for deployments with no Edge Function at all — which is every self-hosted one,
// since the whole reason that function exists is to dodge a serverless timeout a
// VPS does not have.
//
// Both must ask for the same thing. Prompts that drift are not a compile error
// and not a runtime error: one runtime quietly starts producing something the
// other does not, and the first sign is a reader seeing an untranslated caption.
// This file is the single copy, and test/unit/translate-contract.test.ts reads
// the Edge Function's source to prove it still agrees.
//
// Pure and dependency-free so both the tests and the server can import it.

export type Locale = "de" | "en";

export const LANG: Record<Locale, string> = { de: "German", en: "English" };

// Function words, not a language model: locale detection runs on every save and
// must be free and instant. An earlier version asked the model, which under a
// tiny token cap sometimes prefaced its answer and got misparsed to the wrong
// language — translating German into German.
const DE_WORDS = new Set([
  "der", "die", "das", "und", "ist", "wir", "mit", "nicht", "auf", "ein",
  "eine", "den", "dem", "ich", "sich", "auch", "war", "sind", "im", "zum",
  "zur", "uber", "durch", "aber", "noch", "schon", "wie", "uns",
]);
const EN_WORDS = new Set([
  "the", "and", "we", "with", "is", "of", "to", "in", "that", "was",
  "our", "this", "for", "on", "it", "at", "as", "but", "from", "they",
  "were", "had", "have", "there",
]);

function countWords(haystack: string, words: Set<string>): number {
  let n = 0;
  for (const tok of haystack.split(/[^a-zäöüß]+/)) {
    if (words.has(tok)) n++;
  }
  return n;
}

/**
 * Which language a piece of writing is already in.
 *
 * Umlauts count towards German on top of the function words, because a short
 * German sentence can carry none of the latter but rarely none of the former.
 * Ties go to German: it is the default authoring language, and translating
 * German into German is a cheaper mistake than rendering it as pidgin English.
 */
export function detectLocale(text: string): Locale {
  const t = text.toLowerCase();
  const de = countWords(t, DE_WORDS) + (t.match(/[äöüß]/g)?.length ?? 0);
  const en = countWords(t, EN_WORDS);
  return de >= en ? "de" : "en";
}

/** The other one. Sojourn is bilingual, so this is total. */
export function otherLocale(source: Locale): Locale {
  return source === "de" ? "en" : "de";
}

export function bodySystemPrompt(source: Locale, target: Locale): string {
  return (
    `You are a literary translator for a personal travel journal. Translate the Markdown from ${LANG[source]} to ${LANG[target]}. ` +
    "Output ONLY the translated Markdown — no preamble, no code fences. " +
    "Preserve EXACTLY and in place every token of the form [photo:...] and [ask:...]. " +
    "Preserve all Markdown structure (headings, lists, blockquotes, links, emphasis) and the line breaks. " +
    "Do not add or remove content. Keep proper nouns and place names. Keep the warm first-person voice."
  );
}

export function shortSystemPrompt(source: Locale, target: Locale): string {
  return (
    `Translate the human-readable string values in this JSON from ${LANG[source]} to ${LANG[target]}. ` +
    "Return ONLY a JSON object with the SAME shape, the same ids, and the same array lengths and order. " +
    "Translate: title, excerpt, location, every interaction's question/options/explanation, every photo's caption. " +
    "Keep null values null. Keep proper nouns. For 'location', keep specific town / island / landmark names as-is, " +
    "but render country and region names in the target language (e.g. Norway→Norwegen, Sweden→Schweden, Italy→Italien). " +
    "No commentary."
  );
}

export function tripSystemPrompt(source: Locale, target: Locale): string {
  return (
    `Translate the string values in this JSON from ${LANG[source]} to ${LANG[target]}. ` +
    'Return ONLY a JSON object {"title":string,"summary":string|null}. Keep null null, keep proper nouns, no commentary.'
  );
}

/** The JSON shape the short-fields call round-trips. */
export type ShortPost = {
  title: string;
  excerpt: string | null;
  location: string | null;
  interactions: {
    id: string;
    question: string;
    options: string[];
    explanation: string | null;
  }[];
  photos: { id: string; caption: string | null }[];
};

/**
 * The public pages a freshly-translated entity changes.
 *
 * Every index carries titles and excerpts, so a translation lands on more than
 * the entity's own page.
 */
export function pathsFor(entity: "post" | "trip", slug: string | null): string[] {
  const base = ["/", "/posts", "/photos", "/map", "/trips"];
  if (!slug) return base;
  return [...base, entity === "post" ? `/posts/${slug}` : `/trips/${slug}`];
}
