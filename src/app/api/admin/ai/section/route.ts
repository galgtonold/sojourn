import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekChat, aiModels, type ChatMessage } from "@/lib/ai/deepseek";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import {
  langInstruction,
  qaBlock,
  interactionInstruction,
  type Lang,
} from "@/lib/ai/prompt";
import { parseDirectives } from "@/lib/interactions-parse";

export const maxDuration = 60;

const sectionSchema = z.object({
  heading: z.string(),
  beat: z.string().optional().default(""),
  photo_ids: z.array(z.string()).default([]),
  interaction: z
    .object({ kind: z.enum(["poll", "quiz"]), idea: z.string() })
    .nullish(),
});

// Returns the problems with a freshly generated section, so we can re-prompt the
// model to fix its own output (dangling photo tags, malformed poll/quiz blocks).
function sectionProblems(
  markdown: string,
  allowedPhotoIds: Set<string>,
  wantsInteraction: boolean,
): string[] {
  const problems: string[] = [];
  const photoRe = /\[photo:([^\]\s]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = photoRe.exec(markdown)) !== null) {
    if (!allowedPhotoIds.has(m[1]))
      problems.push(`[photo:${m[1]}] is not an allowed photo id for this section`);
  }
  const directives = parseDirectives(markdown);
  for (const d of directives) {
    if (d.problems.includes("question"))
      problems.push("a :::poll/:::quiz block is missing its question");
    if (d.problems.includes("options"))
      problems.push("a :::poll/:::quiz block needs at least two `- ` options");
    if (d.problems.includes("correct"))
      problems.push("the :::quiz block needs exactly one option marked with `=`");
  }
  if (wantsInteraction && directives.length === 0)
    problems.push("the requested poll/quiz :::block is missing");
  if (!wantsInteraction && directives.length > 0)
    problems.push("remove the :::poll/:::quiz block — none was requested here");
  return problems;
}

const schema = z.object({
  postId: z.string().uuid(),
  index: z.number().int().min(0),
  total: z.number().int().min(1),
  title: z.string().optional().default(""),
  section: sectionSchema,
  notes: z.string().optional(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  lang: z.enum(["de", "en"]).default("de"),
});

export const POST = adminRoute(schema, sectionRoute, { requireAi: true });

async function sectionRoute({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, index, total, title, section, notes, answers, lang } = input;

  const [dossier, styleGuide] = await Promise.all([
    buildDossier(supabase, postId),
    buildStyleGuide(supabase, postId),
  ]);

  const byId = new Map(dossier.photos.map((p) => [p.id, p]));
  const photoLines = section.photo_ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      return `[photo:${id}] — ${p.place_name ?? ""} — ${p.ai_description ?? ""}`;
    })
    .filter(Boolean)
    .join("\n");

  const interactionRule = section.interaction
    ? interactionInstruction(
        section.interaction.kind,
        section.interaction.idea,
        lang as Lang,
      )
    : "";

  const system =
    "Du bist ein erfahrener Reiseblog-Autor. " +
    langInstruction(lang as Lang) +
    "\n" +
    styleGuide +
    "\n\nRegeln:\n" +
    "- Erfinde keine Fakten oder Namen; stütze dich nur auf das Material.\n" +
    "- Beginne mit einer Markdown-Zwischenüberschrift (## …). Kein H1, kein Titel.\n" +
    "- Setze die angegebenen [photo:ID]-Tags jeweils in eine eigene Zeile, dort wo sie passen.\n" +
    "- Verwende nur die unten angegebenen Foto-IDs, erfinde keine.\n" +
    "- Schreibe NUR diesen einen Abschnitt, ohne Wiederholung. Antworte mit reinem Markdown (kein JSON)." +
    interactionRule;

  const userPrompt =
    `Beitragstitel: ${title}\n` +
    `Abschnitt ${index + 1} von ${total}: ${section.heading}\n` +
    `Worum es geht: ${section.beat}\n\n` +
    `Fotos für diesen Abschnitt:\n${photoLines || "(keine)"}\n` +
    `${qaBlock(answers, lang as Lang)}` +
    (notes?.trim() ? `\n\nNotizen: ${notes.trim()}` : "");

  const allowedPhotoIds = new Set(section.photo_ids);
  const wantsInteraction = Boolean(section.interaction);

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userPrompt },
  ];
  let markdown = "";
  // Generate, then let the model fix its own structural mistakes (bad photo
  // tags, malformed poll/quiz blocks). Bounded so the pipeline can't stall.
  for (let attempt = 0; attempt < 3; attempt++) {
    markdown = (
      await deepseekChat({
        model: aiModels.reasoner,
        temperature: 0.8,
        maxTokens: 3000,
        meta: { operation: "section", postId, userId: user.id },
        messages,
      })
    ).trim();
    const problems = sectionProblems(markdown, allowedPhotoIds, wantsInteraction);
    if (problems.length === 0) break;
    messages.push({ role: "assistant", content: markdown });
    messages.push({
      role: "user",
      content:
        "Fix only these issues and resend the full section as pure Markdown:\n- " +
        problems.join("\n- "),
    });
  }
  return { markdown };
}
