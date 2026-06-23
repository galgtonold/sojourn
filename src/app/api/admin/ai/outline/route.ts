import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { buildDossier } from "@/lib/ai/dossier";
import { langInstruction, qaBlock, type Lang } from "@/lib/ai/prompt";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  lang: z.enum(["de", "en"]).default("de"),
});

export type OutlineSection = {
  heading: string;
  beat: string;
  photo_ids: string[];
  interaction?: { kind: "poll" | "quiz"; idea: string } | null;
  // Ids of the author's pre-defined interactions placed in this section.
  interaction_refs?: string[];
};

export type Outline = {
  title: string;
  excerpt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cover_photo_id: string | null;
  sections: OutlineSection[];
};

export const POST = adminRoute(schema, outline, { requireAi: true });

async function outline({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, notes, answers, lang } = input;

  const { error: updErr } = await supabase
    .from("posts")
    .update({ ai_notes: notes ?? null })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const dossier = await buildDossier(supabase, postId);
  if (dossier.photos.length === 0 && !notes?.trim()) {
    return NextResponse.json({ error: "Keine Fotos oder Notizen." }, { status: 400 });
  }

  // When the author defined their own polls/quizzes, the model must assign each
  // to a fitting section (and may still add one of its own if the material
  // invites it). Otherwise it falls back to optionally inventing a single one.
  const predefinedBlock = dossier.interactions.length
    ? " WICHTIG: Der Autor hat eigene Interaktionen vordefiniert (siehe „Vom " +
      "Autor vordefinierte Interaktionen“ im Material). Ordne JEDE davon genau " +
      'EINEM passenden Abschnitt zu, über "interaction_refs": ["<id>", …]. Jede ' +
      "vordefinierte Interaktion kommt GENAU EINMAL vor. Du darfst zusätzlich " +
      "nach eigenem Ermessen (passend zu Notizen und Material) HÖCHSTENS EINE " +
      'eigene neue Interaktion über "interaction" ergänzen — oder keine.'
    : "";

  const raw = await deepseekChat({
    model: aiModels.fast,
    temperature: 0.6,
    json: true,
    // Generous headroom: a truncated outline is the #1 cause of an unparseable
    // response, and a half-written plan derails every section that follows.
    maxTokens: 3000,
    meta: { operation: "outline", postId, userId: user.id },
    messages: [
      {
        role: "system",
        content:
          "Du bist Redaktionsassistent für einen Reiseblog. " +
          langInstruction(lang as Lang) +
          " Die Angaben des Autors (Notizen und Antworten) haben IMMER Vorrang " +
          "vor dem Reise-Kontext: bei Widerspruch richte dich nach dem Autor und " +
          "lass den widersprechenden Reise-Kontext weg. Sagt der Autor z. B., der " +
          "Beitrag sei unabhängig von der Reise / handle nur von X, dann ignoriere " +
          "Reise-Hintergrund und Geschwister-Beiträge, die nicht dazu passen.",
      },
      {
        role: "user",
        content:
          `Material:\n${dossier.text}${qaBlock(answers, lang as Lang)}\n\n` +
          "Erstelle einen chronologischen Gliederungsplan. Verteile ALLE oben " +
          "genannten Foto-IDs auf 2–5 Abschnitte (jedes Foto genau einmal, in " +
          "zeitlicher Reihenfolge). Jeder Abschnitt deckt einen ANDEREN Moment " +
          "ab — derselbe Vorfall, dieselbe Begegnung oder dasselbe Motiv darf " +
          "NICHT in mehreren Abschnitten vorkommen. Bei dünnem Material lieber " +
          "wenige, klar getrennte Abschnitte als viele, die sich überschneiden. " +
          "Wenn es sich natürlich anbietet, darf GENAU " +
          "EIN Abschnitt eine kleine Leser-Interaktion bekommen: eine Umfrage " +
          '("poll", Meinungsfrage ohne richtige Antwort) ODER ein Quiz ("quiz", ' +
          "mit einer eindeutig richtigen Antwort aus dem Material). Setze dafür " +
          '"interaction": { "kind": "poll"|"quiz", "idea": kurze Beschreibung der ' +
          'Frage }. Sonst lass das Feld weg.' +
          predefinedBlock +
          " Antworte ausschließlich als JSON:\n" +
          '{ "title": string, "excerpt": string, "location": string, ' +
          '"lat": number|null, "lng": number|null, "cover_photo_id": string, ' +
          '"sections": [ { "heading": string, "beat": string (1 Satz, worum es geht), ' +
          '"photo_ids": string[], "interaction_refs"?: string[], ' +
          '"interaction"?: { "kind": "poll"|"quiz", "idea": string } } ] }' +
          // The title sprawls without a hard limit — keep it short and punchy.
          "\n\nDer Titel ist kurz und prägnant: höchstens 4–6 Wörter, KEIN " +
          "Doppelpunkt-Untertitel und keine erklärenden Zusätze. Lieber ein " +
          "treffendes Bild als eine vollständige Inhaltsangabe." +
          // Re-state the language rule right before generation: title, excerpt
          // and every heading must be in the target language, not the English
          // of the photo descriptions.
          `\n\n${langInstruction(lang as Lang)}`,
      },
    ],
  });
  const outline = parseJsonLoose<Outline>(raw);
  // Keep only real photo ids, at most one *invented* interaction across the post,
  // and each author-defined interaction assigned to exactly one section.
  const valid = new Set(dossier.photos.map((p) => p.id));
  const predefined = new Set(dossier.interactions.map((i) => i.id));
  const assigned = new Set<string>();
  let interactionUsed = false;
  outline.sections = (outline.sections ?? []).map((s) => {
    const refs = (Array.isArray(s.interaction_refs) ? s.interaction_refs : [])
      .filter((id) => predefined.has(id) && !assigned.has(id));
    refs.forEach((id) => assigned.add(id));
    const ix =
      s.interaction &&
      (s.interaction.kind === "poll" || s.interaction.kind === "quiz") &&
      s.interaction.idea?.trim() &&
      !interactionUsed
        ? ((interactionUsed = true), s.interaction)
        : null;
    return {
      ...s,
      photo_ids: (s.photo_ids ?? []).filter((id) => valid.has(id)),
      interaction: ix,
      interaction_refs: refs,
    };
  });
  // Guarantee at least one section so the pipeline can proceed.
  if (outline.sections.length === 0) {
    outline.sections = [
      {
        heading: outline.title || "",
        beat: "",
        photo_ids: dossier.photos.map((p) => p.id),
        interaction_refs: [],
      },
    ];
  }
  // Any author interaction the model didn't place gets distributed round-robin,
  // so every one is guaranteed a home (the section writer emits its [ask:] tag).
  const leftover = [...predefined].filter((id) => !assigned.has(id));
  leftover.forEach((id, i) => {
    const sec = outline.sections[i % outline.sections.length];
    sec.interaction_refs = [...(sec.interaction_refs ?? []), id];
  });
  return { outline };
}
