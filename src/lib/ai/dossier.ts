// Server-only: assembles everything we know about a post into a "dossier" the
// model can narrate from, plus a style guide distilled from past posts.
//
// Split into two halves so the prompt formatting is testable without the I/O
// world: gatherDossierData does ALL the I/O (five reads, reverse-geocoding —
// including the write-back that caches a photo's place_name — and the weather
// call), and the pure renderDossier assembles the German prompt from that data.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseGeocode, reverseGeocodeArea } from "@/lib/ai/geocode";
import { dailyWeather } from "@/lib/ai/weather";
import { orderPhotosForNarrative } from "@/lib/photo-order";
import { matchPhotosToTracks } from "@/lib/photo-track-match";

export type DossierPhoto = {
  id: string;
  url: string | null;
  lat: number | null;
  lng: number | null;
  taken_at: string | null;
  place_name: string | null;
  ai_description: string | null;
  caption: string | null;
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
  // Best automatic geo for the post: coordinates (GPX start → photo centroid →
  // the post's own pin) and a town-level place name. Null when nothing is known.
  geo: { lat: number | null; lng: number | null; place: string | null } | null;
  // The entry's natural date (YYYY-MM-DD): earliest of the GPX track start and
  // the photo timestamps. Null when neither carries a time.
  date: string | null;
  text: string;
};

type TripFields = {
  title?: string;
  summary?: string;
  ai_context?: string;
  start_date?: string;
  end_date?: string;
};

type PostFields = {
  title?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  ai_notes?: string | null;
};

type SiblingSummary = {
  title: string;
  excerpt: string | null;
  questions: string[];
};

// A track with its reverse-geocoded start/end (I/O already done) alongside the
// raw fields render still needs (geojson for the photo↔leg match, started_at for
// the entry date).
type TrackInfo = {
  name: string | null;
  distance_m: number | null;
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
  started_at: string | null;
  startPlace: string | null;
  endPlace: string | null;
};

// Everything gathered from I/O, ready for the pure renderer.
export type DossierData = {
  postId: string;
  post: PostFields | null;
  trip: TripFields | undefined;
  photos: DossierPhoto[];
  manualOrder: boolean;
  interactions: DossierInteraction[];
  siblings: SiblingSummary[];
  trackInfo: TrackInfo[];
  gpxStartCoord: GeoJSON.Position | null;
  gpxArea: string | null;
  weather: Awaited<ReturnType<typeof dailyWeather>> | null;
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

// Mean of the geotagged photos' coordinates, or null when none are geotagged.
// Shared by the weather point and the geo fallback so it's computed once.
function photoCentroid(
  photos: DossierPhoto[],
): { lat: number; lng: number } | null {
  const pts = photos.filter((p) => p.lat != null && p.lng != null);
  if (!pts.length) return null;
  return {
    lat: pts.reduce((s, p) => s + (p.lat as number), 0) / pts.length,
    lng: pts.reduce((s, p) => s + (p.lng as number), 0) / pts.length,
  };
}

const uniqueDates = (isos: (string | null)[]): string[] => [
  ...new Set(
    isos.filter((s): s is string => Boolean(s)).map((s) => s.slice(0, 10)),
  ),
];

/** All the I/O behind a dossier: the reads, the reverse-geocoding (incl. the
 *  write-back that caches a hand-pinned photo's place_name), and the weather. */
export async function gatherDossierData(
  supabase: SupabaseClient,
  postId: string,
): Promise<DossierData> {
  const { data: post } = await supabase
    .from("posts")
    .select("id, title, location, lat, lng, ai_notes, photos_manual_order, trip_id, trips(title, summary, ai_context, start_date, end_date)")
    .eq("id", postId)
    .maybeSingle();

  const { data: photoRows } = await supabase
    .from("photos")
    .select(
      "id, url, lat, lng, taken_at, place_name, ai_description, caption, enriched_at, sort_order",
    )
    .eq("post_id", postId);

  const { data: tracks } = await supabase
    .from("tracks")
    .select("name, distance_m, geojson, started_at")
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

  // The other entries of this trip (drafts included, so question-dedup covers
  // days not yet published), for consistency + never reusing a quiz/poll
  // question. The earlier days' narrative is carried by the continuity brief.
  const { data: siblingRows } = post?.trip_id
    ? await supabase
        .from("posts")
        .select("title, excerpt, published_at, interactions(question)")
        .eq("trip_id", post.trip_id)
        .neq("id", postId)
        .order("published_at", { ascending: true })
    : { data: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const siblings: SiblingSummary[] = ((siblingRows ?? []) as any[]).map((s) => ({
    title: s.title,
    excerpt: s.excerpt ?? null,
    questions: (s.interactions ?? [])
      .map((it: { question?: string }) => it.question)
      .filter((q: unknown): q is string => Boolean(q)),
  }));

  const manualOrder = Boolean(
    (post as { photos_manual_order?: boolean } | null)?.photos_manual_order,
  );
  const photos: DossierPhoto[] = orderPhotosForNarrative(
    photoRows ?? [],
    manualOrder,
  ).map((p) => ({
    id: p.id,
    url: p.url,
    lat: p.lat,
    lng: p.lng,
    taken_at: p.taken_at,
    place_name: p.place_name,
    ai_description: p.ai_description,
    caption: p.caption,
    enriched_at: p.enriched_at,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip = (Array.isArray((post as any)?.trips)
    ? (post as any).trips[0]
    : (post as any)?.trips) as TripFields | undefined;

  // Manually pinned geotags store only coordinates, so a hand-tagged photo has
  // lat/lng but no place_name — to the model that reads as bare numbers.
  // Reverse-geocode those once and CACHE the result back to the row, so each
  // photo line shows a real place and the geotags can stand in as the post's
  // location when none was typed. Best effort: a geocoder hiccup just leaves the
  // coordinates. (This is the dossier's one write — kept here, in the I/O half.)
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
  const trackInfo: TrackInfo[] = [];
  let gpxStartCoord: GeoJSON.Position | null = null;
  for (const tr of tracks ?? []) {
    const geojson =
      (tr.geojson as GeoJSON.FeatureCollection<GeoJSON.LineString> | null) ??
      null;
    const ep = trackEndpoints(geojson);
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
      geojson,
      started_at: (tr.started_at as string | null) ?? null,
      startPlace,
      endPlace,
    });
  }

  // Weather for the day(s) the photos were taken, at one representative point
  // (the outing is localized): photo centroid → GPX start → the post's pin.
  const centroid = photoCentroid(photos);
  let wLat: number | null = null;
  let wLng: number | null = null;
  if (centroid) {
    wLat = centroid.lat;
    wLng = centroid.lng;
  } else if (gpxStartCoord) {
    wLat = gpxStartCoord[1];
    wLng = gpxStartCoord[0];
  } else if (post?.lat != null && post?.lng != null) {
    wLat = post.lat as number;
    wLng = post.lng as number;
  }
  const photoDates = uniqueDates(photos.map((p) => p.taken_at)).sort();
  const weather =
    wLat != null && wLng != null && photoDates.length
      ? await dailyWeather(wLat, wLng, photoDates[0], photoDates[photoDates.length - 1])
      : null;

  // The post's location for the geo block: a town-level name from the GPX start
  // (the author's typed location still wins in render).
  const gpxArea = gpxStartCoord
    ? await reverseGeocodeArea(gpxStartCoord[1], gpxStartCoord[0])
    : null;

  return {
    postId,
    post: post
      ? {
          title: post.title,
          location: post.location,
          lat: post.lat,
          lng: post.lng,
          ai_notes: post.ai_notes,
        }
      : null,
    trip,
    photos,
    manualOrder,
    interactions,
    siblings,
    trackInfo,
    gpxStartCoord,
    gpxArea,
    weather,
  };
}

/** Pure: assemble the German prompt text + geo + date from gathered data. */
export function renderDossier(data: DossierData): Dossier {
  const {
    postId,
    post,
    trip,
    photos,
    manualOrder,
    interactions,
    siblings,
    trackInfo,
    gpxStartCoord,
    gpxArea,
    weather,
  } = data;

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
  const gpxStart = trackInfo.find((t) => t.startPlace)?.startPlace ?? null;
  const locationHint = post?.location?.trim()
    ? post.location.trim()
    : geoPlaces.length
      ? geoPlaces.join(" · ")
      : gpxStart;
  if (locationHint) lines.push(`Ort (grob): ${locationHint}`);

  if (siblings.length) {
    lines.push(
      "",
      "Andere Beiträge dieser Reise — bleibe konsistent (Ton, Fakten, " +
        "wiederkehrende Personen/Motive) und WIEDERHOLE KEINE bereits genutzte " +
        "Quiz-/Umfragefrage:",
    );
    for (const s of siblings) {
      lines.push(
        `• „${s.title}“${s.excerpt ? ` — ${s.excerpt}` : ""}` +
          (s.questions.length
            ? `\n  Bereits genutzte Frage(n): ${s.questions
                .map((q) => `„${q}“`)
                .join("; ")}`
            : ""),
      );
    }
  }

  // Attribute each photo to the recorded track leg it was taken on (by capture
  // time, falling back to proximity), so the model can place a photo on the right
  // route instead of guessing. Pure/offline — no extra queries.
  const trackMatches = matchPhotosToTracks(
    photos.map((p) => ({ id: p.id, takenAt: p.taken_at, lat: p.lat, lng: p.lng })),
    trackInfo.map((t) => ({
      name: t.name,
      geojson: t.geojson,
      distanceM: t.distance_m,
    })),
  );

  lines.push(
    "",
    manualOrder
      ? "Fotos in der vom Autor gewählten Reihenfolge (mit echten IDs). Der Ort ist der Kamera-Standort, nicht zwingend das Motiv:"
      : "Fotos in zeitlicher Reihenfolge (mit echten IDs). Der Ort ist der Kamera-Standort, nicht zwingend das Motiv:",
  );
  if (trackMatches.some(Boolean))
    lines.push(
      "Wo bekannt, steht bei einem Foto, auf welcher Route und ungefähr bei " +
        "welchem Kilometer es entstand — ordne solche Fotos der richtigen Etappe zu.",
    );
  photos.forEach((p, i) => {
    // The full description can be many paragraphs (it powers search); the
    // outline only needs a gist, so trim it to keep the prompt fast.
    const desc = p.ai_description
      ? p.ai_description.replace(/\s+/g, " ").trim().slice(0, 280)
      : "(keine Beschreibung)";
    const m = trackMatches[i];
    const trackPart = m
      ? `${m.via === "time" ? "während" : "auf"} der Route »${m.trackName ?? "Route"}« ` +
        `(ca. km ${m.atKm.toFixed(1)} von ${m.totalKm.toFixed(1)})`
      : null;
    const parts = [
      `${i + 1}. [photo:${p.id}]`,
      fmtTime(p.taken_at),
      p.place_name ?? (p.lat != null ? `${p.lat.toFixed(4)},${p.lng}` : null),
      trackPart,
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

  // The post's geo: coordinates straight from the GPX start (ground truth for a
  // ride) → photo centroid → the post's own pin; and a town-level place name
  // (the author's typed location wins, else the GPX area, else a photo place).
  let geoLat: number | null = null;
  let geoLng: number | null = null;
  if (gpxStartCoord) {
    geoLat = gpxStartCoord[1];
    geoLng = gpxStartCoord[0];
  } else {
    const c = photoCentroid(photos);
    if (c) {
      geoLat = c.lat;
      geoLng = c.lng;
    } else if (post?.lat != null && post?.lng != null) {
      geoLat = post.lat as number;
      geoLng = post.lng as number;
    }
  }
  const geoPlace = post?.location?.trim() || gpxArea || geoPlaces[0] || null;
  const geo =
    geoPlace || geoLat != null
      ? { lat: geoLat, lng: geoLng, place: geoPlace }
      : null;

  // The entry date: earliest of the GPX start and the photo timestamps.
  const photoDates = uniqueDates(photos.map((p) => p.taken_at));
  const trackDates = uniqueDates(trackInfo.map((t) => t.started_at));
  const date = [...photoDates, ...trackDates].sort()[0] ?? null;

  return { postId, photos, interactions, geo, date, text: lines.join("\n") };
}

export async function buildDossier(
  supabase: SupabaseClient,
  postId: string,
): Promise<Dossier> {
  return renderDossier(await gatherDossierData(supabase, postId));
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
