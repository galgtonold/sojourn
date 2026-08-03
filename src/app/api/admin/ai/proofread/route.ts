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
  CAPTION_PREFIX,
  type ProofUnit,
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
    "You are given a JSON object with fields \"title\", \"excerpt\" and \"body\". " +
    "The body may contain placeholders of the form [[KEEP-0]], [[KEEP-1]] … — these " +
    "stand for images and interactive blocks: NEVER flag them and NEVER include one " +
    "in your output.\n" +
    "Return ONLY a JSON object of the form " +
    '{"findings":[{"field":"title"|"excerpt"|"body","type":"spelling"|"grammar"|"punctuation"|"capitalization"|"wordchoice","original":"…","suggestion":"…","explanation":"…"}]}. ' +
    "For each finding, `original` MUST be an exact, verbatim substring copied from " +
    "the given field text (long enough to be unique), and `suggestion` is the exact " +
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
  const { data: photos } = await supabase
    .from("photos")
    .select("id, caption, sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });

  const units: ProofUnit[] = [
    { key: "title", text: title },
    { key: "excerpt", text: excerpt },
    { key: "body", text: masked },
    ...((photos ?? []) as { id: string; caption: string | null }[])
      .map((p, i) => ({
        key: `${CAPTION_PREFIX}${p.id}`,
        text: p.caption ?? "",
        // Position in the gallery, so the author can find it. Numbering counts
        // every photo, not just captioned ones — "caption 4" has to mean the
        // fourth photo or it sends them hunting.
        ordinal: i + 1,
      }))
      .filter((u) => u.text.trim() !== ""),
  ].filter((u) => u.text.trim() !== "");

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
  // The caption units travel back too. The dialog already holds title/excerpt/
  // body, but it has never seen a caption — and it needs the full text, not just
  // the matched fragment, to compose several fixes into one new value.
  const captions = units
    .filter((u) => u.key.startsWith(CAPTION_PREFIX))
    .map((u) => ({ key: u.key, text: u.text, ordinal: u.ordinal }));
  return { findings: validateFindings(parsed, units), captions };
}