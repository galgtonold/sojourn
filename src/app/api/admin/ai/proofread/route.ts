import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import {
  aiModels,
  deepseekChat,
  parseJsonLoose,
  type ChatMessage,
} from "@/lib/ai/deepseek";
import { maskProtectedTokens } from "@/lib/ai/token-mask";
import { validateFindings } from "@/lib/ai/proofread";

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

async function proofread({ user, input }: AdminCtx<z.infer<typeof schema>>) {
  const { postId, title, excerpt, body, lang } = input;
  const { masked } = maskProtectedTokens(body);
  const fields = { title, excerpt, body: masked };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(lang) },
    { role: "user", content: JSON.stringify(fields) },
  ];

  const raw = await deepseekChat({
    model: aiModels.fast,
    temperature: 0,
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
  return { findings: validateFindings(parsed, fields) };
}
