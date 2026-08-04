import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import {
  deepseekChat,
  parseJsonLoose,
  type ChatMessage,
} from "@/lib/ai/deepseek";
import { maskProtectedTokens } from "@/lib/ai/token-mask";
import {
  validateFindings,
  buildProofUnits,
  POST_KEYS,
} from "@/lib/ai/proofread";

// A single bounded JSON call; keep headroom for a long post.
export const maxDuration = 180;

const schema = z.object({
  postId: z.string().uuid(),
  title: z.string().default(""),
  excerpt: z.string().default(""),
  body: z.string().default(""),
  lang: z.enum(["de", "en"]).default("de"),
});

export const POST = adminRoute(schema, proofread, { requireAi: true });

function systemPrompt(lang: "de" | "en"): string {
  const shared =
    "You are a meticulous proofreader. Find ONLY objective correctness errors: " +
    "spelling/typos, grammar, punctuation, capitalization, and clearly wrong words. " +
    "Do NOT suggest stylistic, tonal, or rephrasing changes, and do NOT rewrite for " +
    "flow — if a passage is merely a matter of taste, leave it alone.\n" +
    "You are given a JSON object with a `units` array. Each unit has a `key` and " +
    "a `text`. The keys are \"title\", \"excerpt\" and \"body\" for the article; " +
    "\"caption:<id>\" and \"alt:<id>\" for a photo's caption and its alt text; and " +
    "\"question:<id>\", \"option:<id>:<n>\" and \"explanation:<id>\" for a poll or " +
    "quiz. Check EVERY unit. The short ones are written in haste and read by " +
    "everybody — they deserve the same scrutiny as the body, not less.\n" +
    "The body may contain placeholders of the form [[KEEP-0]], [[KEEP-1]] … — these " +
    "stand for images and interactive blocks: NEVER flag them and NEVER include one " +
    "in your output.\n" +
    "Return ONLY a JSON object of the form " +
    '{"findings":[{"key":"<the unit key, copied exactly>","type":"spelling"|"grammar"|"punctuation"|"capitalization"|"wordchoice","original":"…","suggestion":"…","explanation":"…"}]}. ' +
    "For each finding, `original` MUST be an exact, verbatim substring copied from " +
    "THAT unit's text (long enough to be unique within it), and `suggestion` is the exact " +
    "text that should replace that substring. Keep `original`/`suggestion` as short " +
    "as the fix allows. Give a one-sentence `explanation`. If there are no errors, " +
    'return {"findings":[]}.';
  const de =
    "\nThe text is in German: apply German orthography (ß vs. ss, capitalization of " +
    "nouns, comma rules, correct umlauts). Write each `explanation` in German.";
  const en = "\nThe text is in English. Write each `explanation` in English.";
  return shared + (lang === "de" ? de : en);
}

async function proofread({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, title, excerpt, body, lang } = input;
  const { masked } = maskProtectedTokens(body);

  // Captions are read here rather than sent by the client: the editor's copy can
  // be stale, and the server already has a session that RLS lets read the photos
  // of a post this user may edit.
  const [{ data: photos, error: photosError }, { data: blocks }] =
    await Promise.all([
      supabase
        .from("photos")
        .select("id, caption, alt, sort_order")
        .eq("post_id", postId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("interactions")
        .select("id, question, options, explanation, sort_order")
        .eq("post_id", postId)
        .order("sort_order", { ascending: true }),
    ]);

  type PhotoRow = { id: string; caption: string | null; alt: string | null };
  type BlockRow = {
    id: string;
    question: string | null;
    options: unknown;
    explanation: string | null;
  };

  // Same builder the editor uses for the pre-publish signature, so the two can
  // never disagree about what "the text" is.
  const units = buildProofUnits({
    title,
    excerpt,
    body: masked,
    photos: (photos ?? []) as PhotoRow[],
    interactions: ((blocks ?? []) as BlockRow[]).map((b) => ({
      id: b.id,
      question: b.question,
      options: Array.isArray(b.options) ? (b.options as string[]) : [],
      explanation: b.explanation,
    })),
  });

  // What actually went to the model. Token arithmetic could not settle whether
  // captions were reaching the call — this says so outright, in the runtime log,
  // without a schema change or a guess.
  console.log(
    `[proofread] post=${postId} units=${units.length} ` +
      `extras=${units.filter((u) => !(POST_KEYS as readonly string[]).includes(u.key)).length} ` +
      `photosRead=${photos?.length ?? "null"} blocksRead=${blocks?.length ?? "null"}` +
      (photosError ? ` photosError=${photosError.code ?? photosError.message}` : ""),
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(lang) },
    { role: "user", content: JSON.stringify({ units }) },
  ];

  const raw = await deepseekChat({
    model: "fast",
    temperature: 0,
    // Thinking OFF, and this is the whole fix.
    //
    // Proofreading is recognition, not deliberation, and this model does not
    // know when to stop deliberating about German orthography. Measured against
    // a real 4,600-character article: an 8000-token cap produced 8000 reasoning
    // tokens and no answer; 32000 produced 32000 and no answer, the thinking
    // visibly circling back over sentences it had already cleared. There is no
    // cap that finishes, which is why raising one never helped.
    //
    // With thinking off the same article returns in ~6s — and on planted errors
    // it caught 5/5 where the reasoning run caught 4/5. Faster, cheaper, and
    // better, which is rare enough to be worth writing down.
    noThinking: true,
    // Ample: the answer is a short JSON list. Nothing escalates it any more.
    maxTokens: 8000,
    json: true,
    messages,
    meta: { operation: "proofread", postId, userId: user.id },
  });

  let parsed: unknown = { findings: [] };
  try {
    parsed = parseJsonLoose(raw);
  } catch {
    parsed = { findings: [] };
  }
  // Everything that is not a post field travels back too. The dialog holds
  // title/excerpt/body already, but has never seen a caption, an alt text or a
  // quiz option — and it needs each whole string, not just the matched fragment,
  // to compose several fixes into one new value.
  const extras = units
    .filter((u) => !(POST_KEYS as readonly string[]).includes(u.key))
    .map((u) => ({ key: u.key, text: u.text, ordinal: u.ordinal }));
  const findings = validateFindings(parsed, units);
  // Raw vs kept, so a finding lost in validation is distinguishable from one the
  // model never made — the two need completely different fixes.
  const rawCount = Array.isArray((parsed as { findings?: unknown })?.findings)
    ? ((parsed as { findings: unknown[] }).findings ?? []).length
    : 0;
  console.log(
    `[proofread] post=${postId} rawFindings=${rawCount} kept=${findings.length} ` +
      `keptExtras=${findings.filter((f) => !(POST_KEYS as readonly string[]).includes(f.key)).length}`,
  );
  // `captions` kept as an alias so a browser tab still running the previous
  // bundle keeps working through the deploy — it reads that name.
  return { findings, extras, captions: extras };
}