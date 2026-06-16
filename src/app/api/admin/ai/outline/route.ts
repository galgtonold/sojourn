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
          langInstruction(lang as Lang),
      },
      {
        role: "user",
        content:
          `Material:\n${dossier.text}${qaBlock(answers, lang as Lang)}\n\n` +
          "Erstelle einen chronologischen Gliederungsplan. Verteile ALLE oben " +
          "genannten Foto-IDs auf 3–6 Abschnitte (jedes Foto genau einmal, in " +
          "zeitlicher Reihenfolge). Wenn es sich natürlich anbietet, darf GENAU " +
          "EIN Abschnitt eine kleine Leser-Interaktion bekommen: eine Umfrage " +
          '("poll", Meinungsfrage ohne richtige Antwort) ODER ein Quiz ("quiz", ' +
          "mit einer eindeutig richtigen Antwort aus dem Material). Setze dafür " +
          '"interaction": { "kind": "poll"|"quiz", "idea": kurze Beschreibung der ' +
          'Frage }. Sonst lass das Feld weg. Antworte ausschließlich als JSON:\n' +
          '{ "title": string, "excerpt": string, "location": string, ' +
          '"lat": number|null, "lng": number|null, "cover_photo_id": string, ' +
          '"sections": [ { "heading": string, "beat": string (1 Satz, worum es geht), ' +
          '"photo_ids": string[], "interaction"?: { "kind": "poll"|"quiz", "idea": string } } ] }' +
          // Re-state the language rule right before generation: title, excerpt
          // and every heading must be in the target language, not the English
          // of the photo descriptions.
          `\n\n${langInstruction(lang as Lang)}`,
      },
    ],
  });
  const outline = parseJsonLoose<Outline>(raw);
  // Keep only real photo ids, and at most one interaction across the post.
  const valid = new Set(dossier.photos.map((p) => p.id));
  let interactionUsed = false;
  outline.sections = (outline.sections ?? []).map((s) => {
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
    };
  });
  // Guarantee at least one section so the pipeline can proceed.
  if (outline.sections.length === 0) {
    outline.sections = [
      {
        heading: outline.title || "",
        beat: "",
        photo_ids: dossier.photos.map((p) => p.id),
      },
    ];
  }
  return { outline };
}
