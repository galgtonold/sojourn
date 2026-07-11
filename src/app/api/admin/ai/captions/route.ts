import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, deepseekJson } from "@/lib/ai/deepseek";
import { langInstruction, type Lang } from "@/lib/ai/prompt";
import { selectCaptionTargets } from "@/lib/ai/caption-select";
import { fetchCaptionSources, saveCaptions } from "@/lib/db/photos";
import { localProse } from "@/lib/ai/caption-context";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  lang: z.enum(["de", "en"]).default("de"),
  onlyEmpty: z.boolean().optional().default(false),
  // The article's prose, so captions echo its voice and framing rather than
  // reading like standalone image descriptions. The draft pipeline passes the
  // freshly-assembled body (not yet persisted); the standalone button omits it
  // and we fall back to the saved body.
  body: z.string().optional(),
  phase: z.enum(["draft", "polish"]).default("polish"),
  // Polish targets exactly these ids (the ones the draft wrote), so it never
  // skips a just-drafted caption nor touches a manual one the draft excluded.
  photoIds: z.array(z.string()).optional(),
});

// Generates a concise caption for each of a post's photos from their cached
// descriptions. The caption doubles as the image's alt text, so there's just
// one field. Usable inside the draft pipeline or as a standalone action.
export const POST = adminRoute(schema, captions, { requireAi: true });

async function captions({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, lang, onlyEmpty } = input;

  // Prefer the body the caller passed (the draft pipeline, mid-assembly);
  // otherwise read what's persisted (the standalone "caption" button).
  let body = input.body ?? "";
  if (!body) {
    const { data: post } = await supabase
      .from("posts")
      .select("body")
      .eq("id", postId)
      .maybeSingle();
    body = post?.body ?? "";
  }

  const { phase } = input;
  const sources = await fetchCaptionSources(supabase, postId);
  const targets =
    phase === "polish" && input.photoIds
      ? selectCaptionTargets(sources, { onlyEmpty: false, ids: input.photoIds })
      : selectCaptionTargets(sources, { onlyEmpty });

  if (targets.length === 0) return phase === "draft" ? { count: 0, ids: [] } : { count: 0 };

  const nearby = (p: (typeof targets)[number]) =>
    (p.nearby_places ?? []).filter(Boolean).join(", ");
  const desc = (p: (typeof targets)[number]) =>
    (p.ai_description ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

  // Draft runs before the article exists — no "Text daneben" yet.
  const draftList = targets
    .map(
      (p) =>
        `${p.id} | Ort (Kamera-Standort): ${p.place_name ?? "—"} | ` +
        `In der Nähe: ${nearby(p) || "—"} | Bild: ${desc(p)}`,
    )
    .join("\n");

  // Polish carries the exact prose next to each photo, so the caption can add
  // what that text doesn't already say.
  const polishList = targets
    .map(
      (p) =>
        `${p.id} | Ort (Kamera-Standort): ${p.place_name ?? "—"} | ` +
        `In der Nähe: ${nearby(p) || "—"} | Bild: ${desc(p)} | ` +
        `Text daneben: ${localProse(body, p.id) || "—"}`,
    )
    .join("\n");

  const placeNote =
    "Der genannte Ort ist der Kamera-Standort, nicht zwingend das Motiv — " +
    "verlasse dich auf die Beschreibung, nicht auf den Ortsnamen.\n";

  const truthNote =
    "Die Bildunterschrift (auch eine Pointe oder ein Gag) darf NICHTS behaupten, " +
    "das die Bildbeschreibung nicht hergibt — kein erfundener Besitz („unser …“), " +
    "keine erfundene Identität, Funktion, Namen, Zahlen oder Fakten. Witzig gern, " +
    "aber nur über Ton und echte, sichtbare Beobachtung; im Zweifel sachlich " +
    "bleiben.\n";

  const draftInstruction =
    "Erstelle für jede Zeile eine kurze Bildunterschrift (caption, max ~12 " +
    "Wörter), die das Bild für nicht-sehende Leser erkennbar macht und zum " +
    "lockeren Ton des Blogs passt. Nenne den genauen Ort / das Wahrzeichen aus " +
    "„In der Nähe“, wenn es klar zum Bild passt. Kein „Foto von …“. " +
    placeNote +
    truthNote +
    'Antworte als JSON: { "items": [ { "id": string, "caption": string } ] }\n\n' +
    draftList;

  const polishInstruction =
    "Zu jedem Foto steht unten „Text daneben“ — das, was im Artikel direkt neben " +
    "dem Bild steht. Schreibe für jede Zeile eine Bildunterschrift (caption, max " +
    "~12 Wörter), die ETWAS HINZUFÜGT, das dieser Text daneben noch NICHT sagt: " +
    "ein konkretes sichtbares Detail, den genauen Ort / das Wahrzeichen (aus „In " +
    "der Nähe“, wenn es zum Bild passt), einen kleinen Kontext ODER einen kurzen, " +
    "trockenen Gag bzw. eine pointierte Bemerkung. WIEDERHOLE NICHT den Text " +
    "daneben. Bleib am Bild (die Unterschrift dient auch als Alternativtext), aber " +
    "sie darf pointiert oder witzig sein statt bloß beschreibend. Kein „Foto von " +
    "…“. " +
    placeNote +
    truthNote +
    'Antworte als JSON: { "items": [ { "id": string, "caption": string } ] }\n\n' +
    polishList;

  const data = await deepseekJson<{
    items: { id: string; caption: string }[];
  }>({
    model: aiModels.fast,
    temperature: 0.5,
    // Real headroom so the items array for a large gallery (up to 40 photos)
    // never truncates mid-JSON — a truncated response is unparseable and the
    // caption step is best-effort, so it would fail silently, leaving every
    // caption empty. (2500 was hit exactly on a 10-photo post.)
    maxTokens: 8000,
    meta: { operation: phase === "draft" ? "captions:draft" : "captions", postId, userId: user.id },
    messages: [
      {
        role: "system",
        content:
          "Du textest knappe Bildunterschriften für einen persönlichen " +
          "Reiseblog – locker, im „du“, niemals förmlich. " +
          langInstruction(lang as Lang),
      },
      { role: "user", content: phase === "draft" ? draftInstruction : polishInstruction },
    ],
  });

  // Keep only captions for photos we actually asked about (the model can echo a
  // stray id), then persist them.
  const valid = new Set(targets.map((p) => p.id));
  const items = (data.items ?? []).filter((it) => valid.has(it.id));
  const count = await saveCaptions(supabase, items, {
    postId,
    userId: user.id,
  });
  return phase === "draft" ? { count, ids: targets.map((p) => p.id) } : { count };
}
