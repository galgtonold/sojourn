// Server-only: assembles everything we know about a post into a "dossier" the
// model can narrate from, plus a style guide distilled from past posts.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DossierPhoto = {
  id: string;
  url: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string | null;
  place_name: string | null;
  ai_description: string | null;
  enriched_at: string | null;
};

export type Dossier = {
  postId: string;
  photos: DossierPhoto[];
  text: string;
};

function fmtTime(iso: string | null): string {
  if (!iso) return "ohne Zeit";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ohne Zeit";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function buildDossier(
  supabase: SupabaseClient,
  postId: string,
): Promise<Dossier> {
  const { data: post } = await supabase
    .from("posts")
    .select("id, title, location, ai_notes, trip_id, trips(title, summary, ai_context, start_date, end_date)")
    .eq("id", postId)
    .maybeSingle();

  const { data: photoRows } = await supabase
    .from("photos")
    .select(
      "id, url, lat, lng, taken_at, place_name, ai_description, enriched_at, sort_order",
    )
    .eq("post_id", postId);

  const { data: tracks } = await supabase
    .from("tracks")
    .select("name, distance_m")
    .eq("post_id", postId);

  // The other published entries of this trip, so the model stays consistent
  // with what it already wrote and never reuses a quiz/poll question.
  const { data: siblings } = post?.trip_id
    ? await supabase
        .from("posts")
        .select("title, excerpt, body, published_at, interactions(question)")
        .eq("trip_id", post.trip_id)
        .neq("id", postId)
        .eq("published", true)
        .order("published_at", { ascending: true })
    : { data: null };

  const photos: DossierPhoto[] = (photoRows ?? [])
    .slice()
    .sort((a, b) => {
      const ta = a.taken_at ? Date.parse(a.taken_at) : Infinity;
      const tb = b.taken_at ? Date.parse(b.taken_at) : Infinity;
      if (ta !== tb) return ta - tb;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    })
    .map((p) => ({
      id: p.id,
      url: p.url,
      lat: p.lat,
      lng: p.lng,
      taken_at: p.taken_at,
      place_name: p.place_name,
      ai_description: p.ai_description,
      enriched_at: p.enriched_at,
    }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip = (Array.isArray((post as any)?.trips)
    ? (post as any).trips[0]
    : (post as any)?.trips) as
    | {
        title?: string;
        summary?: string;
        ai_context?: string;
        start_date?: string;
        end_date?: string;
      }
    | undefined;

  const lines: string[] = [];
  if (trip?.title) lines.push(`Reise: ${trip.title}`);
  if (trip?.start_date)
    lines.push(
      `Zeitraum: ${trip.start_date}${trip.end_date ? ` – ${trip.end_date}` : ""}`,
    );
  if (trip?.summary) lines.push(`Reise-Kontext: ${trip.summary}`);
  if (trip?.ai_context)
    lines.push(`Reise-Hintergrund (Autor, intern): ${trip.ai_context}`);
  if (post?.location) lines.push(`Ort (grob): ${post.location}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sibs = (siblings ?? []) as any[];
  if (sibs.length) {
    lines.push(
      "",
      "Bereits veröffentlichte Beiträge dieser Reise — bleibe konsistent dazu " +
        "(Ton, Fakten, wiederkehrende Personen/Motive) und WIEDERHOLE KEINE " +
        "bereits genutzte Quiz-/Umfragefrage:",
    );
    for (const s of sibs) {
      const qs = (s.interactions ?? [])
        .map((it: { question?: string }) => it.question)
        .filter(Boolean);
      const snippet = String(s.body ?? "")
        .replace(/\[(photo|ask):[^\]]+\]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 320);
      lines.push(
        `• „${s.title}“${s.excerpt ? ` — ${s.excerpt}` : ""}` +
          (snippet ? `\n  Auszug: ${snippet}…` : "") +
          (qs.length
            ? `\n  Bereits genutzte Frage(n): ${qs
                .map((q: string) => `„${q}“`)
                .join("; ")}`
            : ""),
      );
    }
  }

  lines.push("", "Fotos in zeitlicher Reihenfolge (mit echten IDs):");
  photos.forEach((p, i) => {
    const parts = [
      `${i + 1}. [photo:${p.id}]`,
      fmtTime(p.taken_at),
      p.place_name ?? (p.lat != null ? `${p.lat.toFixed(4)},${p.lng}` : null),
      p.ai_description ?? "(keine Beschreibung)",
    ].filter(Boolean);
    lines.push(parts.join(" — "));
  });

  if (tracks && tracks.length) {
    lines.push("", "Routen (GPX):");
    for (const t of tracks) {
      const km = t.distance_m ? `${(t.distance_m / 1000).toFixed(1)} km` : "";
      lines.push(`- ${t.name || "Track"}${km ? ` (${km})` : ""}`);
    }
  }

  if (post?.ai_notes?.trim()) {
    lines.push("", "Notizen des Autors:", post.ai_notes.trim());
  }

  return { postId, photos, text: lines.join("\n") };
}

/** A short voice guide from the author's most recent published posts. */
export async function buildStyleGuide(
  supabase: SupabaseClient,
  excludePostId: string,
): Promise<string> {
  const { data } = await supabase
    .from("posts")
    .select("title, body")
    .eq("published", true)
    .neq("id", excludePostId)
    .order("published_at", { ascending: false })
    .limit(2);

  if (!data || data.length === 0) {
    return (
      "Schreibe in einer warmen, persönlichen Reisetagebuch-Stimme aus der " +
      "Wir-Perspektive, bildhaft aber nicht kitschig."
    );
  }
  const samples = data
    .map((p) => `### ${p.title}\n${(p.body ?? "").slice(0, 1200)}`)
    .join("\n\n");
  return (
    "Orientiere dich eng an der Stimme, dem Satzrhythmus und dem Wortschatz " +
    "dieser früheren Beiträge des Autors:\n\n" +
    samples
  );
}
