// Pure: the article prose immediately around a photo's inline [photo:id] tag, so
// a caption can COMPLEMENT what the reader just read there instead of repeating
// it. Bounded and cut at adjacent media tags so it never pulls another photo's
// surroundings. Returns "" when the photo isn't placed inline.

const TOKENS = /\[(?:photo|ask):[^\]]+\]/g;
const FENCES = /:::(?:poll|quiz)[\s\S]*?:::/g;

function clean(s: string): string {
  return s
    .replace(FENCES, "")
    .replace(TOKENS, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function localProse(body: string, photoId: string, window = 350): string {
  const tag = `[photo:${photoId}]`;
  const idx = body.indexOf(tag);
  if (idx < 0) return "";

  // Before: back only to the previous media tag, then the nearest `window` chars.
  const beforeRaw = body.slice(0, idx);
  const prevTag = Math.max(beforeRaw.lastIndexOf("[photo:"), beforeRaw.lastIndexOf("[ask:"));
  const beforeStart = prevTag >= 0 ? beforeRaw.indexOf("]", prevTag) + 1 : 0;
  const before = clean(beforeRaw.slice(beforeStart)).slice(-window);

  // After: forward only to the next media tag, then the first `window` chars.
  const afterRaw = body.slice(idx + tag.length);
  const nexts = [afterRaw.indexOf("[photo:"), afterRaw.indexOf("[ask:")].filter((n) => n >= 0);
  const afterEnd = nexts.length ? Math.min(...nexts) : afterRaw.length;
  const after = clean(afterRaw.slice(0, afterEnd)).slice(0, window);

  return [before, after].filter(Boolean).join(" … ").trim();
}
