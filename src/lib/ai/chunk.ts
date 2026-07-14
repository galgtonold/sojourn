// Split a post into small embeddable chunks: one distilled "summary" chunk
// (title + location + excerpt) plus body paragraphs, in EACH available language
// (source + translations). Embedding short, focused chunks — and scoring a post
// by its best-matching chunk — separates far better than one vector over the
// whole narrative. Pure (no server-only deps), so it's unit-testable.
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import type { PostTranslation } from "@/lib/types";
import { stripRefTags } from "@/lib/references";

export type PostChunk = {
  locale: Locale;
  kind: "summary" | "body";
  idx: number;
  content: string;
};

const MAX_CHUNK = 900; // chars; comfortably short relative to the model's window

// Strip markdown noise that adds nothing to (or hurts) the embedding: inline
// media/poll tags, images, link URLs (keep the text), and formatting punctuation.
function clean(md: string): string {
  return stripRefTags(md, " ")
    .replace(/:::[\s\S]*?:::/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function paragraphs(md: string): string[] {
  return clean(md)
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 2);
}

// Greedily pack paragraphs into chunks up to MAX_CHUNK; hard-split any single
// paragraph that's longer than that.
function pack(paras: string[], max = MAX_CHUNK): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (!cur) cur = p;
    else if (cur.length + 1 + p.length <= max) cur += " " + p;
    else {
      out.push(cur);
      cur = p;
    }
  }
  if (cur) out.push(cur);
  return out.flatMap((c) =>
    c.length <= max ? [c] : (c.match(new RegExp(`.{1,${max}}`, "gs")) ?? [c]),
  );
}

function variant(
  post: {
    title: string;
    excerpt?: string | null;
    body?: string | null;
    location?: string | null;
    i18n?: Partial<Record<Locale, PostTranslation>> | null;
  },
  locale: Locale,
) {
  const tr = post.i18n?.[locale];
  return {
    title: tr?.title ?? post.title,
    excerpt: tr?.excerpt ?? post.excerpt ?? null,
    body: tr?.body ?? post.body ?? null,
    location: post.location ?? null, // place names aren't translated
  };
}

export function buildPostChunks(post: {
  title: string;
  excerpt?: string | null;
  body?: string | null;
  location?: string | null;
  source_locale?: Locale | null;
  i18n?: Partial<Record<Locale, PostTranslation>> | null;
}): PostChunk[] {
  const source = (post.source_locale ?? DEFAULT_LOCALE) as Locale;
  // Source language + any translation that actually exists (skip locales that
  // would just fall back to the source text — those would be duplicate chunks).
  const langs = Array.from(
    new Set<Locale>([source, ...(Object.keys(post.i18n ?? {}) as Locale[])]),
  ).filter((l) => (LOCALES as string[]).includes(l));

  const chunks: PostChunk[] = [];
  for (const locale of langs) {
    const v = variant(post, locale);
    let idx = 0;
    const summary = [v.title, v.location, v.excerpt]
      .map((x) => (x ?? "").trim())
      .filter(Boolean)
      .join(". ");
    if (summary) chunks.push({ locale, kind: "summary", idx: idx++, content: summary });
    for (const c of pack(paragraphs(v.body ?? "")))
      chunks.push({ locale, kind: "body", idx: idx++, content: c });
  }
  return chunks;
}
