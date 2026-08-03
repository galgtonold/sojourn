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
  segmentBody,
  mergeFindingPayloads,
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

/** Concurrency across segments: enough to stay inside maxDuration, few enough
 *  not to trip provider rate limits on a long post. */
const LANES = 3;

async function proofread({ user, input }: AdminCtx<z.infer<typeof schema>>) {
  const { postId, title, excerpt, body, lang } = input;
  const { masked } = maskProtectedTokens(body);
  const fields = { title, excerpt, body: masked };

  // One unit for the headings, then the body in segments. Each is a separate
  // bounded call: sending the whole post in one go is what started failing —
  // see the note above segmentBody in @/lib/ai/proofread.
  const units: { title: string; excerpt: string; body: string }[] = [
    ...(title || excerpt ? [{ title, excerpt, body: "" }] : []),
    ...segmentBody(masked).map((seg) => ({ title: "", excerpt: "", body: seg })),
  ];

  const askOne = async (unit: (typeof units)[number]): Promise<unknown> => {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(lang) },
      { role: "user", content: JSON.stringify(unit) },
    ];
    try {
      const raw = await deepseekChat({
        model: "fast",
        temperature: 0,
        // Generous from the outset, and deliberately not escalated.
        //
        // A segment is ~1400 characters — a few hundred tokens in, and findings
        // for it are shorter still. 8000 is therefore enormous headroom, most of
        // which exists for `reasoning_content`, which is billed against this cap
        // and arrives before the first byte of the answer.
        //
        // If even that is not enough, doubling it is not the answer: it buys the
        // same truncation twice more, at 16000 and 32000, with the author
        // watching a spinner through all three. That is precisely how a failed
        // proofread came to take minutes instead of seconds. One generous
        // attempt, then say so.
        maxTokens: 8000,
        escalateCap: false,
        json: true,
        messages,
        meta: { operation: "proofread", postId, userId: user.id },
      });
      return parseJsonLoose(raw);
    } catch {
      // One bad segment must not lose the findings from the others. The author
      // sees fewer suggestions, never an error page.
      return { findings: [] };
    }
  };

  const payloads: unknown[] = [];
  for (let i = 0; i < units.length; i += LANES) {
    payloads.push(...(await Promise.all(units.slice(i, i + LANES).map(askOne))));
  }

  // Validated against the FULL fields, not the segment it came from: every
  // segment is a verbatim slice, so `original` still resolves — and anything
  // the model invented does not, and is dropped.
  return { findings: validateFindings(mergeFindingPayloads(payloads), fields) };
}
