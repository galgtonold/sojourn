import type { DossierPhoto } from "@/lib/ai/dossier";

type PhotoLine = Pick<DossierPhoto, "id" | "place_name" | "ai_description" | "caption">;

// One prompt line per section photo, in order. Surfaces the caption that will
// be shown under the image so the writer can COMPLEMENT it instead of restating
// it; the place is the camera-location, not necessarily the subject.
export function sectionPhotoLines(photos: PhotoLine[]): string {
  return photos
    .map((p) => {
      const desc = (p.ai_description ?? "").replace(/\s+/g, " ").trim().slice(0, 480);
      const caption = (p.caption ?? "").replace(/\s+/g, " ").trim();
      const parts = [
        `[photo:${p.id}]`,
        p.place_name ? `Kamera-Standort: ${p.place_name}` : "",
        caption ? `Bildunterschrift (wird unter dem Bild gezeigt): „${caption}“` : "",
        desc,
      ].filter(Boolean);
      return parts.join(" — ");
    })
    .join("\n");
}
