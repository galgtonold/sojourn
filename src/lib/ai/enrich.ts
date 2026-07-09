// Server-only photo enrichment: a verbose, geo-grounded German description of
// the image plus a reverse-geocoded place name. Both are cached on the photo
// row so each photo is processed once.
//
// DeepSeek's API has no image input, so the description goes through a separate
// OpenAI-compatible vision endpoint (see `env.vision*`). The description is
// intentionally long — it feeds both semantic/full-text search and the article
// generator, so richer is better.
import "server-only";
import { env, isVisionConfigured } from "@/lib/env";
import { recordUsage } from "@/lib/ai/usage";
import type { UsageMeta } from "@/lib/ai/deepseek";
import { reverseGeocode, nearbyPlaces } from "@/lib/ai/geocode";

export type EnrichablePhoto = {
  id: string;
  url: string | null;
  lat: number | null;
  lng: number | null;
  ai_description: string | null;
  place_name: string | null;
  enriched_at: string | null;
};

const SYSTEM =
  "Du bist ein aufmerksamer Bildredakteur für einen Reiseblog. Beschreibe das " +
  "Foto SEHR ausführlich auf Deutsch, in mehreren Absätzen (mindestens drei): " +
  "1) Hauptmotiv und Bildkomposition; 2) Umgebung, Landschaft oder Architektur, " +
  "Details im Vorder- und Hintergrund; 3) Licht, Tageszeit, Wetter, Farben und " +
  "Stimmung. Benenne sichtbare Objekte, Materialien, Texturen und lesbare " +
  "Schilder. Diese Beschreibung dient der Volltext- und Vektorsuche UND als " +
  "Materialgrundlage zum Schreiben eines Artikels — lieber zu viel als zu wenig " +
  "Detail. Spekuliere nicht über die Identität konkreter Personen und erfinde " +
  "keine Orte; stütze dich nur auf das Sichtbare (und den ggf. genannten " +
  "Aufnahmeort).";

// The user-turn text for the vision call. Frames the geocoded place as where
// the CAMERA stood (not necessarily the subject) and offers nearby candidates
// the model may bind to what it actually sees — never as a licence to guess.
export function visionUserText(place: string | null, candidates: string[]): string {
  const lines: string[] = [];
  if (place)
    lines.push(
      `Kamera-Standort (nur grobe Einordnung, NICHT zwingend das Motiv, nicht erfinden): ${place}.`,
    );
  const others = candidates.filter((c) => c && c !== place);
  if (others.length)
    lines.push(
      `In der Nähe liegen u. a.: ${others.join("; ")}. Eines davon KANN das Motiv sein — ` +
        "benenne es nur, wenn es klar zum Sichtbaren passt; sonst beschreibe nur das " +
        "Sichtbare und rate NICHT.",
    );
  lines.push("Beschreibe dieses Reisefoto so ausführlich wie möglich.");
  return lines.join("\n");
}

// One call to the (OpenAI-compatible) vision provider.
async function visionChat(
  imageUrl: string,
  userText: string,
  meta?: UsageMeta,
): Promise<string> {
  const res = await fetch(`${env.visionBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.visionApiKey}`,
    },
    body: JSON.stringify({
      model: env.visionModel,
      temperature: 0.4,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vision ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const u = data?.usage ?? {};
  await recordUsage({
    operation: meta?.operation ?? "enrich",
    model: env.visionModel,
    postId: meta?.postId,
    userId: meta?.userId,
    usage: {
      prompt_tokens: u.prompt_tokens ?? 0,
      completion_tokens: u.completion_tokens ?? 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: u.prompt_tokens ?? 0,
    },
  });
  return data?.choices?.[0]?.message?.content ?? "";
}

/** A verbose, place-grounded description of one photo — or null on any failure
 *  (or when no vision provider is configured). */
export async function describeImage(
  imageUrl: string,
  place: string | null,
  candidates: string[],
  meta?: UsageMeta,
): Promise<string | null> {
  if (!isVisionConfigured) return null;
  const abs =
    imageUrl.startsWith("http") || imageUrl.startsWith("data:")
      ? imageUrl
      : `${env.siteUrl}${imageUrl}`;
  try {
    const text = await visionChat(abs, visionUserText(place, candidates), meta);
    return text.trim() || null;
  } catch {
    return null;
  }
}

/** Computes (but does not persist) enrichment for a photo, skipping fields that
 *  already have a value. Geocodes FIRST so the description can be grounded in
 *  the place. */
export async function computeEnrichment(
  photo: EnrichablePhoto,
  meta?: UsageMeta,
): Promise<{
  ai_description: string | null;
  place_name: string | null;
}> {
  const needsPlace =
    !photo.place_name && photo.lat != null && photo.lng != null;
  const place = needsPlace
    ? await reverseGeocode(photo.lat as number, photo.lng as number)
    : photo.place_name;

  const needsDescription = !photo.ai_description && Boolean(photo.url);
  const candidates =
    needsDescription && photo.lat != null && photo.lng != null
      ? await nearbyPlaces(photo.lat as number, photo.lng as number)
      : [];
  // Hand the stored URL straight to the vision model (a WebP/JPEG it can fetch);
  // we avoid the Next optimizer here because it can negotiate AVIF, which vision
  // APIs reject.
  const description = needsDescription
    ? await describeImage(photo.url as string, place ?? null, candidates, meta)
    : photo.ai_description;

  return {
    ai_description: description ?? photo.ai_description,
    place_name: place ?? photo.place_name,
  };
}
