import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, deepseekJson } from "@/lib/ai/deepseek";
import { buildDossier } from "@/lib/ai/dossier";
import { reconcileOutline, type Outline } from "@/lib/ai/outline-plan";
import { continuityBlock, langInstruction, qaBlock, type Lang } from "@/lib/ai/prompt";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  lang: z.enum(["de", "en"]).default("de"),
  brief: z.string().optional(),
});

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

  const continuity = continuityBlock(input.brief ?? "");
  const outline = await deepseekJson<Outline>({
    model: aiModels.fast,
    temperature: 0.6,
    // A truncated outline is the #1 cause of an unparseable response, and a
    // half-written plan derails every section that follows. A rich plan (many
    // photos, several requested interactions) can exceed a few thousand tokens,
    // so give it real headroom — the cap only ever acts as a stop, never a
    // squeeze. (3000 was routinely hit exactly, truncating the JSON mid-plan and
    // triggering a slow retry storm that could exhaust and fail the step.)
    maxTokens: 8000,
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
          (continuity ? continuity + "\n\n" : "") +
          `Material:\n${dossier.text}${qaBlock(answers, lang as Lang)}\n\n` +
          "Erstelle einen chronologischen Gliederungsplan. " +
          "Jeder eigenständige, erzählenswerte Vorgang aus den Notizen bekommt " +
          "einen Platz im Plan — auch wenn KEIN Foto dazu existiert. Ordne solche " +
          "foto-losen Episoden dem chronologisch passenden Abschnitt zu (im „beat“ " +
          "benannt) oder gib ihnen einen eigenen kurzen Abschnitt. Lass nichts " +
          "Belegtes aus, nur weil kein Bild dazugehört. " +
          "Verteile ALLE oben genannten Foto-IDs auf 2–5 Abschnitte (jedes Foto " +
          "genau einmal). BEHALTE DABEI DIE VORGEGEBENE REIHENFOLGE DER FOTOS BEI " +
          "und weiche nur ab, wenn es der Erzählung klar dient. Erfinde KEINEN " +
          "Abschnitt nur, um ein einzelnes Foto unterzubringen — hänge es an den " +
          "thematisch nächsten Abschnitt. " +
          "Ordne jedes Foto dem Abschnitt zu, dessen Moment es ZEIGT (nutze die " +
          "Bildbeschreibung), nicht nach Position: ein Innenraum- oder Motiv-Foto " +
          "gehört zu dem Abschnitt, der genau diesen Ort/Moment erzählt (ein " +
          "Hotel-Innenraum zum Hotel-Abschnitt, nicht in einen späteren Rückblick). " +
          "Lege KEINEN reinen Rückblick-/Zusammenfassungs-Abschnitt an, der den Tag " +
          "noch einmal aufzählt; ein Abschnitt, der nur wegen einer Interaktion " +
          "existiert, trägt KEIN Foto und wiederholt den Tag nicht. " +
          "Mehr als 5 Abschnitte nur, wenn " +
          "ausdrücklich verlangte Interaktionen sie brauchen. Jeder Abschnitt deckt einen ANDEREN Moment " +
          "ab — derselbe Vorfall, dieselbe Begegnung oder dasselbe Motiv darf " +
          "NICHT in mehreren Abschnitten vorkommen. Bei dünnem Material lieber " +
          "wenige, klar getrennte Abschnitte als viele, die sich überschneiden. " +
          "Normalerweise bekommt HÖCHSTENS EIN Abschnitt eine kleine " +
          "Leser-Interaktion: eine Umfrage " +
          '("poll", Meinungsfrage ohne richtige Antwort) ODER ein Quiz ("quiz", ' +
          "mit einer eindeutig richtigen Antwort aus dem Material). VERLANGT der " +
          'Autor aber ausdrücklich mehrere (z. B. „ein Quiz mit 5 Fragen“), ' +
          "erstelle so viele, wie er verlangt — JEDER Abschnitt trägt aber nur " +
          "EINE Interaktion, also verteile sie auf mehrere Abschnitte und lege " +
          "bei Bedarf eigene kurze Abschnitte dafür an (höchstens 6 " +
          "Interaktionen insgesamt). " +
          'Setze pro betroffenem Abschnitt "interaction": { "kind": ' +
          '"poll"|"quiz", "idea": kurze Beschreibung der Frage }. Sonst lass das ' +
          "Feld weg." +
          " Plane jede Interaktion GENAU EINMAL: Wiederhole KEINE Interaktions-Idee " +
          "in einem zweiten Abschnitt und erfinde keine, die eine bereits geplante " +
          "oder vom Autor vordefinierte Interaktion thematisch wiederholt." +
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
  // Reconcile the model's plan against real data — valid photo ids, the
  // one-place-per author interaction guarantee, the invented-interaction cap,
  // every photo placed, and real location/coords/date (not the model's guess).
  return {
    outline: reconcileOutline(outline, {
      photoIds: dossier.photos.map((p) => p.id),
      interactionIds: dossier.interactions.map((i) => i.id),
      geo: dossier.geo,
      date: dossier.date,
    }),
  };
}
