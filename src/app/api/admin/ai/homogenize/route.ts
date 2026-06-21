import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, type ChatMessage } from "@/lib/ai/deepseek";
import { enqueueLlmJob } from "@/lib/ai/jobs";
import { buildStyleGuide } from "@/lib/ai/dossier";
import { langInstruction, type Lang } from "@/lib/ai/prompt";

// Sync fallback runs here; keep headroom (clamped to the plan limit). With the
// Edge Function configured the route only enqueues + returns a jobId to poll.
export const maxDuration = 180;

const schema = z.object({
  postId: z.string().uuid(),
  lang: z.enum(["de", "en"]).default("de"),
  // Already masked by the client: every [photo:]/[ask:] tag and :::poll/:::quiz
  // block is a [[KEEP-n]] sentinel, so the rewrite can't corrupt their content.
  body: z.string().min(1),
});

export const POST = adminRoute(schema, homogenize, { requireAi: true });

// One editing pass that turns the section-by-section draft into a single
// coherent article: smooth transitions, drop repetition and stray sign-offs.
// An editing task (not generation), so it uses the fast, non-reasoning model —
// faster as the last step, and no chain-of-thought truncation risk.
async function homogenize({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, lang, body } = input;
  const styleGuide = await buildStyleGuide(supabase, postId);

  const system =
    "Du bist ein erfahrener Redakteur für einen Reiseblog. " +
    langInstruction(lang as Lang) +
    "\n" +
    styleGuide +
    "\n\nAufgabe: Der folgende Beitrag wurde abschnittsweise geschrieben und " +
    "liest sich noch wie lose Einzelstücke. Überarbeite ihn zu EINEM " +
    "zusammenhängenden, durchgehend lesbaren Artikel.\n\nRegeln:\n" +
    "- Behalte Inhalt, Fakten, Aussagen und die Reihenfolge bei; erfinde nichts " +
    "dazu und lösche keine Inhalte.\n" +
    "- Sorge für flüssige Übergänge zwischen den Abschnitten und entferne " +
    "Wiederholungen (mehrfach erklärte Hintergründe, doppelte Einleitungen oder " +
    "Abschlüsse).\n" +
    "- Halte den Ton locker und persönlich. Sprich die Leser – wenn überhaupt – " +
    "mit „du“ an, niemals mit „Sie“; kein förmliches Amtsdeutsch. Wandle " +
    "vorhandenes Siezen in Duzen um.\n" +
    "- Entferne alle Brief-Elemente: Anreden, Grußformeln und Unterschriften " +
    "(z. B. „Herzlich, …“, „Liebe Grüße“, eine Namenszeile). Der Artikel ist " +
    "kein Brief und endet ohne Verabschiedung.\n" +
    "- Behalte die Zwischenüberschriften (## …) bei (leichtes Straffen ist ok); " +
    "füge kein H1 und keinen Titel hinzu.\n" +
    "- WICHTIG: Platzhalter der Form [[KEEP-0]], [[KEEP-1]], … stehen für Bilder " +
    "und interaktive Elemente. Übernimm JEDEN Platzhalter unverändert (exakt " +
    "gleiche Schreibweise) und an einer sinnvollen Stelle — in der Regel dort, " +
    "wo er steht. Lösche keinen, dupliziere keinen und erfinde keinen neuen.\n" +
    "- Antworte mit reinem Markdown (kein JSON, keine umschließenden Code-Fences).";

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: body },
  ];

  const { jobId } = await enqueueLlmJob(
    { model: aiModels.fast, temperature: 0.4, maxTokens: 32000, messages },
    { operation: "homogenize", postId, userId: user.id },
  );
  return { jobId };
}
