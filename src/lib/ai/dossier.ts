// Server-only: assembles everything we know about a post into a "dossier" the
// model can narrate from, plus a style guide distilled from past posts.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseGeocode } from "@/lib/ai/geocode";
import { dailyWeather } from "@/lib/ai/weather";

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

// An interaction the author defined themselves (not AI-generated). These must be
// placed into the article — the model references them by their [ask:<id>] tag.
export type DossierInteraction = {
  id: string;
  kind: "poll" | "quiz";
  question: string;
  options: string[];
};

export type Dossier = {
  postId: string;
  photos: DossierPhoto[];
  interactions: DossierInteraction[];
  text: string;
};

// First and last coordinate of a track's GeoJSON, as [lng, lat]. A track may
// hold several segments — start of the first, end of the last.
function trackEndpoints(
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> | null | undefined,
): { start: GeoJSON.Position; end: GeoJSON.Position } | null {
  let start: GeoJSON.Position | null = null;
  let end: GeoJSON.Position | null = null;
  for (const f of geojson?.features ?? []) {
    const cs = f.geometry?.coordinates ?? [];
    if (!cs.length) continue;
    if (!start) start = cs[0];
    end = cs[cs.length - 1];
  }
  return start && end ? { start, end } : null;
}

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
    .select("id, title, location, lat, lng, ai_notes, trip_id, trips(title, summary, ai_context, start_date, end_date)")
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
    .select("name, distance_m, geojson")
    .eq("post_id", postId);

  // The author's own polls/quizzes for this post — these MUST be woven into the
  // generated article (referenced by their [ask:<id>] tag), never invented anew
  // or dropped. AI-generated interactions from a previous draft are excluded.
  const { data: definedInteractions } = await supabase
    .from("interactions")
    .select("id, kind, question, options, source")
    .eq("post_id", postId)
    .eq("source", "author")
    .order("sort_order", { ascending: true });
  const interactions: DossierInteraction[] = (definedInteractions ?? []).map(
    (it) => ({
      id: it.id as string,
      kind: it.kind as "poll" | "quiz",
      question: (it.question as string) ?? "",
      options: (it.options as string[]) ?? [],
    }),
  );

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

  // Manually pinned geotags store only coordinates, so a hand-tagged photo has
  // lat/lng but no place_name — to the model that reads as bare numbers.
  // Reverse-geocode those once and cache the result, so each photo line shows a
  // real place and the geotags can stand in as the post's location when none was
  // typed. Best effort: a geocoder hiccup just leaves the coordinates.
  for (const p of photos) {
    if (p.lat == null || p.lng == null || p.place_name) continue;
    const name = await reverseGeocode(p.lat, p.lng);
    if (name) {
      p.place_name = name;
      await supabase.from("photos").update({ place_name: name }).eq("id", p.id);
    }
  }

  // Resolve where each GPX route actually starts and ends. A route is hard data
  // (the model can't argue with it), so its start grounds the location and stops
  // the outline inventing a place. Best effort — a geocoder hiccup just omits it.
  const trackInfo: {
    name: string | null;
    distance_m: number | null;
    startPlace: string | null;
    endPlace: string | null;
  }[] = [];
  let gpxStartCoord: GeoJSON.Position | null = null;
  for (const tr of tracks ?? []) {
    const ep = trackEndpoints(
      tr.geojson as GeoJSON.FeatureCollection<GeoJSON.LineString> | null,
    );
    let startPlace: string | null = null;
    let endPlace: string | null = null;
    if (ep) {
      if (!gpxStartCoord) gpxStartCoord = ep.start;
      [startPlace, endPlace] = await Promise.all([
        reverseGeocode(ep.start[1], ep.start[0]),
        reverseGeocode(ep.end[1], ep.end[0]),
      ]);
    }
    trackInfo.push({
      name: tr.name,
      distance_m: tr.distance_m,
      startPlace,
      endPlace,
    });
  }
  const gpxStart = trackInfo.find((t) => t.startPlace)?.startPlace ?? null;

  const lines: string[] = [];
  if (trip?.title) lines.push(`Reise: ${trip.title}`);
  if (trip?.start_date)
    lines.push(
      `Zeitraum: ${trip.start_date}${trip.end_date ? ` – ${trip.end_date}` : ""}`,
    );
  if (trip?.summary) lines.push(`Reise-Kontext: ${trip.summary}`);
  if (trip?.ai_context)
    lines.push(`Reise-Hintergrund (Autor, intern): ${trip.ai_context}`);
  // The author's location field wins — it can carry a curated name (e.g. "Bruno
  // Weber Park") that reverse-geocoding a GPS point never yields. Fall back to
  // where the geotagged photos actually were only when the field is empty.
  const geoPlaces = [
    ...new Set(
      photos
        .filter((p) => p.lat != null && p.place_name)
        .map((p) => p.place_name as string),
    ),
  ];
  const locationHint = post?.location?.trim()
    ? post.location.trim()
    : geoPlaces.length
      ? geoPlaces.join(" · ")
      : gpxStart;
  if (locationHint) lines.push(`Ort (grob): ${locationHint}`);

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
    // The full description can be many paragraphs (it powers search); the
    // outline only needs a gist, so trim it to keep the prompt fast.
    const desc = p.ai_description
      ? p.ai_description.replace(/\s+/g, " ").trim().slice(0, 280)
      : "(keine Beschreibung)";
    const parts = [
      `${i + 1}. [photo:${p.id}]`,
      fmtTime(p.taken_at),
      p.place_name ?? (p.lat != null ? `${p.lat.toFixed(4)},${p.lng}` : null),
      desc,
    ].filter(Boolean);
    lines.push(parts.join(" — "));
  });

  if (trackInfo.length) {
    lines.push("", "Routen (GPX):");
    for (const t of trackInfo) {
      const km = t.distance_m ? `${(t.distance_m / 1000).toFixed(1)} km` : "";
      lines.push(`- ${t.name || "Track"}${km ? ` (${km})` : ""}`);
      if (t.startPlace && t.endPlace && t.startPlace === t.endPlace) {
        lines.push(`  Start/Ziel: ${t.startPlace} (Rundtour)`);
      } else {
        if (t.startPlace) lines.push(`  Start: ${t.startPlace}`);
        if (t.endPlace) lines.push(`  Ziel: ${t.endPlace}`);
      }
    }
  }

  // Weather for the day(s) the photos were taken, at one representative point
  // (the outing is localized). Falls back to the GPX start, then the post's pin.
  const coordPhotos = photos.filter((p) => p.lat != null && p.lng != null);
  let wLat: number | null = null;
  let wLng: number | null = null;
  if (coordPhotos.length) {
    wLat =
      coordPhotos.reduce((s, p) => s + (p.lat as number), 0) / coordPhotos.length;
    wLng =
      coordPhotos.reduce((s, p) => s + (p.lng as number), 0) / coordPhotos.length;
  } else if (gpxStartCoord) {
    wLat = gpxStartCoord[1];
    wLng = gpxStartCoord[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if ((post as any)?.lat != null && (post as any)?.lng != null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wLat = (post as any).lat;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wLng = (post as any).lng;
  }
  const photoDates = [
    ...new Set(
      photos
        .map((p) => p.taken_at)
        .filter((s): s is string => Boolean(s))
        .map((s) => s.slice(0, 10)),
    ),
  ].sort();
  if (wLat != null && wLng != null && photoDates.length) {
    const weather = await dailyWeather(
      wLat,
      wLng,
      photoDates[0],
      photoDates[photoDates.length - 1],
    );
    if (weather && weather.length) {
      lines.push("", "Wetter an diesen Tagen (laut Wetterdaten):");
      for (const w of weather) {
        const temp =
          w.tMin != null && w.tMax != null
            ? `, ${Math.round(w.tMin)}–${Math.round(w.tMax)} °C`
            : "";
        const rain =
          w.precipMm != null && w.precipMm >= 0.5
            ? `, ${w.precipMm.toFixed(1)} mm Niederschlag`
            : "";
        lines.push(`- ${w.date}: ${w.label}${temp}${rain}`);
      }
    }
  }

  if (interactions.length) {
    lines.push(
      "",
      "Vom Autor vordefinierte Interaktionen — diese MÜSSEN im Artikel " +
        "vorkommen. Platziere jede an einer passenden Stelle als Tag " +
        "[ask:<id>] in einer eigenen Zeile; schreibe die Optionen oder die " +
        "Antwort NICHT in den Fließtext:",
    );
    for (const it of interactions) {
      const label = it.kind === "quiz" ? "Quiz" : "Umfrage";
      lines.push(`- [ask:${it.id}] (${label}): „${it.question}“`);
    }
  }

  if (post?.ai_notes?.trim()) {
    lines.push("", "Notizen des Autors:", post.ai_notes.trim());
  }

  return { postId, photos, interactions, text: lines.join("\n") };
}

/**
 * The voice guide fed into generation: the author's binding, blog-wide style
 * directive (site_settings.writing_style) first, then a few recent posts as
 * concrete reinforcement, falling back to a sensible default.
 */
export async function buildStyleGuide(
  supabase: SupabaseClient,
  excludePostId: string,
): Promise<string> {
  const [{ data: settings }, { data }] = await Promise.all([
    supabase
      .from("site_settings")
      .select("writing_style")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("posts")
      .select("title, body")
      .eq("published", true)
      .neq("id", excludePostId)
      .order("published_at", { ascending: false })
      .limit(2),
  ]);

  const parts: string[] = [];
  const style = ((settings?.writing_style as string) ?? "").trim();
  if (style)
    parts.push(
      "Verbindliche Stil-Vorgabe des Autors für den gesamten Blog — befolge sie eng:\n" +
        style,
    );

  if (data && data.length) {
    const samples = data
      .map((p) => `### ${p.title}\n${(p.body ?? "").slice(0, 1200)}`)
      .join("\n\n");
    parts.push(
      "Orientiere dich außerdem an Stimme, Satzrhythmus und Wortschatz dieser " +
        "früheren Beiträge des Autors:\n\n" +
        samples,
    );
  }

  if (parts.length === 0)
    return (
      "Schreibe in einer warmen, persönlichen Reisetagebuch-Stimme aus der " +
      "Wir-Perspektive, bildhaft aber nicht kitschig."
    );
  return parts.join("\n\n");
}
