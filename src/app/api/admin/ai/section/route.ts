import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, type ChatMessage } from "@/lib/ai/deepseek";
import { enqueueLlmJob } from "@/lib/ai/jobs";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import { sectionPhotoLines } from "@/lib/ai/section-prompt";
import {
  langInstruction,
  qaBlock,
  interactionInstruction,
  predefinedInteractionInstruction,
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
  // Ids of the author's pre-defined interactions to place in this section.
  interaction_refs: z.array(z.string()).optional().default([]),
});

const schema = z.object({
  postId: z.string().uuid(),
  index: z.number().int().min(0),
  total: z.number().int().min(1),
  title: z.string().optional().default(""),
  section: sectionSchema,
  // The whole plan (every section's heading + beat) so this section knows what
  // the others cover and never retells their material — sections are generated
  // independently and would otherwise repeat the same moment.
  outline: z
    .array(z.object({ heading: z.string(), beat: z.string().default("") }))
    .optional(),
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
  const photoLines = sectionPhotoLines(
    section.photo_ids
      .map((id) => byId.get(id))
      .filter((p): p is (typeof dossier.photos)[number] => Boolean(p)),
  );

  // Author-defined interactions assigned to this section — place their exact
  // [ask:<id>] tags. Plus, optionally, the single interaction the model invented.
  const refItems = (section.interaction_refs ?? [])
    .map((id) => dossier.interactions.find((it) => it.id === id))
    .filter((it): it is (typeof dossier.interactions)[number] => Boolean(it));
  const interactionRule =
    (refItems.length
      ? predefinedInteractionInstruction(refItems, lang as Lang)
      : "") +
    (section.interaction
      ? interactionInstruction(
          section.interaction.kind,
          section.interaction.idea,
          lang as Lang,
        )
      : "");

  // The full plan, so this section can see every other section's scope and stay
  // out of it (sections are written independently, blind to each other's text).
  const planText = (input.outline ?? [])
    .map(
      (s, i) =>
        `${i + 1}. ${s.heading}${s.beat ? ` — ${s.beat}` : ""}${
          i === index ? "  ← DEIN Abschnitt" : ""
        }`,
    )
    .join("\n");

  const system =
    "Du bist ein erfahrener Reiseblog-Autor. " +
    langInstruction(lang as Lang) +
    "\n" +
    styleGuide +
    "\n\nRegeln:\n" +
    "- Erfinde KEINE Erlebnisse. Alles, was der Autor konkret sieht, tut, hört, " +
    "riecht, schmeckt, sagt oder erlebt, MUSS aus dem Material stammen (Fotos, " +
    "Notizen, Antworten). Erfinde insbesondere NICHT: ausgemalte Ess- oder " +
    "Verkostungsszenen („wir tauchten den Löffel in die Creme …“), Café- oder " +
    "Innenraum-Szenen, Geräusche (Vögel, Musik, Radio), konkrete Handgriffe und " +
    "Abläufe („er hob den Balg und öffnete das Türchen“), Begegnungen, Zitate, " +
    "Tiere oder Sichtachsen („zwischen den Bäumen tauchten die Dächer auf“). " +
    "Frei erfinden darfst du NUR Stimmung, Gefühl und Licht — keine konkreten " +
    "Ereignisse und keine überprüfbaren Tatsachen.\n" +
    "- Erfinde auch NICHT das Verbindende zwischen den belegten Momenten: keine " +
    "ausgedachten Anmarschwege, Zwischenstationen, Verkehrsmittel oder " +
    "Zeitangaben („gegen sieben saßen wir im Zug“), keine erfundenen Panoramen " +
    "oder Fernblicke und nichts, was „unterwegs“ gesehen oder gehört wurde, " +
    "sofern es nicht im Material steht. Verbinde die belegten Szenen knapp und " +
    "über die Stimmung, nicht über ausgedachte Ereignisse.\n" +
    "- Lieber kurz als erfunden: Ist das Material für einen Moment dünn, schreibe " +
    "KNAPPER und bleib bei der Stimmung — fülle die Lücke NICHT mit ausgedachten " +
    "Szenen. Lebendigkeit entsteht aus dem, was wirklich da ist, plus Stimmung, " +
    "nicht aus erfundenen Details.\n" +
    "- Zu einem BERÜHMTEN Ort darfst du sparsam einen kurzen, allgemein bekannten " +
    "und sicher zutreffenden Fakt als Hintergrund einflechten (z. B. eine bekannte " +
    "Bauweise oder Geschichte) — aber nur, wenn du dir der Richtigkeit wirklich " +
    "sicher bist, und niemals als persönliche Beobachtung formuliert. Im Zweifel " +
    "weglassen. Rate keine Arten, Materialien, Maße, Zahlen oder Namen.\n" +
    "- Bei Widersprüchen haben die Angaben des Autors (Notizen, Antworten) " +
    "VORRANG vor dem Reise-Kontext: folge dem Autor und lass widersprechenden " +
    "Reise-Kontext (Reise-Hintergrund, Geschwister-Beiträge) weg.\n" +
    "- Bleib strikt bei DEINEM Abschnitt. Stoff, der laut Gesamtaufbau zu einem " +
    "anderen Abschnitt gehört, kommt hier NICHT vor — nicht vorgreifen, nicht " +
    "nacherzählen. Jeder Vorfall und jede Begegnung wird im ganzen Artikel nur " +
    "EINMAL erzählt, in genau dem dafür vorgesehenen Abschnitt.\n" +
    "- Locker und persönlich im Ton. Sprich die Leserinnen und Leser – wenn " +
    "überhaupt – mit „du“ an, NIEMALS mit „Sie“. Kein förmliches Behörden- oder " +
    "Amtsdeutsch (auch nicht ironisch); ein „ernster“ oder trockener Gag bleibt " +
    "trotzdem in dieser lockeren Du-Stimme.\n" +
    "- Beginne mit einer Markdown-Zwischenüberschrift (## …). Kein H1, kein Titel.\n" +
    "- Setze die angegebenen [photo:ID]-Tags jeweils in eine eigene Zeile, dort wo sie passen.\n" +
    "- Zu JEDEM Bild wird automatisch die angegebene Bildunterschrift gezeigt. " +
    "ERGÄNZE sie — wiederhole und umschreibe sie NICHT und beschreibe das Bild " +
    "nicht im Fließtext. Der [photo:ID]-Tag steht für sich; erzähle den Moment " +
    "und die Stimmung, nicht das ohnehin Sichtbare. Der angegebene Ort ist der " +
    "Kamera-Standort, nicht zwingend das Motiv — behaupte nicht, der Ort sei das " +
    "Abgebildete, wenn die Beschreibung etwas anderes zeigt.\n" +
    "- Verwende nur die unten angegebenen Foto-IDs, erfinde keine.\n" +
    "- Dies ist EIN Abschnitt mitten in einem längeren Artikel, kein eigenständiger " +
    "Beitrag und kein Brief: keine Anrede, keine Grußformel und keine Unterschrift " +
    "(z. B. „Herzlich, …“, „Liebe Grüße“, Namenszeile) — weder am Anfang noch am Ende.\n" +
    "- Erfinde KEINE Quiz-, Umfrage- oder Ratefrage im Fließtext: keine " +
    "Antwortoptionen (a)/b)/c) oder A)/B)/C)), keine „Welche/r … war es?“- oder " +
    "„Stimmt ab“-Frage ans Publikum, kein „kleine Umfrage zum Schluss“. Leser- " +
    "Interaktionen erscheinen AUSSCHLIESSLICH (a) als [ask:<id>]-Tag für eine vom " +
    "Autor vorbereitete Interaktion oder (b) als vollständiger :::poll-/:::quiz- " +
    "Block — und beides NUR, wenn es unten ausdrücklich verlangt wird; sonst gar keine.\n" +
    "- Schreibe NUR diesen einen Abschnitt, ohne Wiederholung. Antworte mit reinem Markdown (kein JSON)." +
    interactionRule +
    (avoidPhotoIds.length
      ? `\n\nKORREKTUR: Ein vorheriger Versuch hat diese Foto-IDs ERFUNDEN — sie existieren NICHT und dürfen NICHT vorkommen: ${avoidPhotoIds.join(
          ", ",
        )}. Verwende ausschließlich die unten gelisteten Foto-IDs.`
      : "");

  const userPrompt =
    `Beitragstitel: ${title}\n` +
    (planText ? `\nGesamtaufbau des Artikels:\n${planText}\n` : "") +
    `\nDein Abschnitt ${index + 1} von ${total}: ${section.heading}\n` +
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
    { model: aiModels.reasoner, temperature: 0.5, maxTokens: 32000, messages },
    { operation: "section", postId, userId: user.id },
  );
  return { jobId };
}
