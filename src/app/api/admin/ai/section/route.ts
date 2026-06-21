import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, type ChatMessage } from "@/lib/ai/deepseek";
import { enqueueLlmJob } from "@/lib/ai/jobs";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import {
  langInstruction,
  qaBlock,
  interactionInstruction,
  type Lang,
} from "@/lib/ai/prompt";

// The synchronous fallback runs here, so keep headroom (clamped to the plan
// limit). With the Edge Function configured the route only enqueues + returns.
export const maxDuration = 180;

const sectionSchema = z.object({
  heading: z.string(),
  beat: z.string().optional().default(""),
  photo_ids: z.array(z.string()).default([]),
  interaction: z
    .object({ kind: z.enum(["poll", "quiz"]), idea: z.string() })
    .nullish(),
});

const schema = z.object({
  postId: z.string().uuid(),
  index: z.number().int().min(0),
  total: z.number().int().min(1),
  title: z.string().optional().default(""),
  section: sectionSchema,
  notes: z.string().optional(),
  answers: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
  lang: z.enum(["de", "en"]).default("de"),
  // Photo ids a prior attempt invented — fed back so the repair pass avoids them.
  avoidPhotoIds: z.array(z.string()).optional(),
});

export const POST = adminRoute(schema, sectionRoute, { requireAi: true });

// Builds the section prompt and enqueues the (slow) generation as a job; the
// client polls /api/admin/ai/job/[id] for the resulting markdown.
async function sectionRoute({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, index, total, title, section, notes, answers, lang } = input;
  const avoidPhotoIds = input.avoidPhotoIds ?? [];

  const [dossier, styleGuide] = await Promise.all([
    buildDossier(supabase, postId),
    buildStyleGuide(supabase, postId),
  ]);

  const byId = new Map(dossier.photos.map((p) => [p.id, p]));
  const photoLines = section.photo_ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      // Trim the (search-grade, multi-paragraph) description to a workable
      // length so the call stays well under the time limit.
      const desc = (p.ai_description ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 480);
      return `[photo:${id}] — ${p.place_name ?? ""} — ${desc}`;
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
    "- Locker und persönlich im Ton. Sprich die Leserinnen und Leser – wenn " +
    "überhaupt – mit „du“ an, NIEMALS mit „Sie“. Kein förmliches Behörden- oder " +
    "Amtsdeutsch (auch nicht ironisch); ein „ernster“ oder trockener Gag bleibt " +
    "trotzdem in dieser lockeren Du-Stimme.\n" +
    "- Beginne mit einer Markdown-Zwischenüberschrift (## …). Kein H1, kein Titel.\n" +
    "- Setze die angegebenen [photo:ID]-Tags jeweils in eine eigene Zeile, dort wo sie passen.\n" +
    "- Verwende nur die unten angegebenen Foto-IDs, erfinde keine.\n" +
    "- Dies ist EIN Abschnitt mitten in einem längeren Artikel, kein eigenständiger " +
    "Beitrag und kein Brief: keine Anrede, keine Grußformel und keine Unterschrift " +
    "(z. B. „Herzlich, …“, „Liebe Grüße“, Namenszeile) — weder am Anfang noch am Ende.\n" +
    "- Stelle den Leser:innen KEINE Quiz-, Umfrage- oder Ratefrage im Fließtext: " +
    "keine Antwortoptionen (a)/b)/c) oder A)/B)/C)), keine „Welche/r … war es?“- " +
    "oder „Stimmt ab“-Frage ans Publikum, kein „kleine Umfrage zum Schluss“. Die " +
    "EINZIGE erlaubte Leser-Interaktion ist ein vollständiger :::poll-/:::quiz- " +
    "Block — und auch den NUR, wenn er unten ausdrücklich verlangt wird; sonst gar keine.\n" +
    "- Schreibe NUR diesen einen Abschnitt, ohne Wiederholung. Antworte mit reinem Markdown (kein JSON)." +
    interactionRule +
    (avoidPhotoIds.length
      ? `\n\nKORREKTUR: Ein vorheriger Versuch hat diese Foto-IDs ERFUNDEN — sie existieren NICHT und dürfen NICHT vorkommen: ${avoidPhotoIds.join(
          ", ",
        )}. Verwende ausschließlich die unten gelisteten Foto-IDs.`
      : "");

  const userPrompt =
    `Beitragstitel: ${title}\n` +
    `Abschnitt ${index + 1} von ${total}: ${section.heading}\n` +
    `Worum es geht: ${section.beat}\n\n` +
    `Fotos für diesen Abschnitt:\n${photoLines || "(keine)"}\n` +
    `${qaBlock(answers, lang as Lang)}` +
    (notes?.trim() ? `\n\nNotizen: ${notes.trim()}` : "");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userPrompt },
  ];

  const { jobId } = await enqueueLlmJob(
    // The reasoner spends part of its budget on reasoning_content *before* the
    // answer, so any tight cap risks truncating the prose — mid-sentence, or
    // mid-poll (leaving a bare ":::poll"). A section's actual prose is short, so
    // set the cap absurdly high: it only ever acts as a stop, never a squeeze.
    { model: aiModels.reasoner, temperature: 0.8, maxTokens: 32000, messages },
    { operation: "section", postId, userId: user.id },
  );
  return { jobId };
}
