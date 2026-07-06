"use client";
// Match a post's un-located photos to its timestamped GPX tracks and persist the
// hits. UI-free: returns what changed so callers own presentation. Shared by the
// manual "Locate photos from track" button and the auto-geotag-on-upload paths.
import { getBrowserSupabase } from "@/lib/supabase/client";
import { trackSamples, geotagPhotos, type PhotoTime } from "@/lib/geotag-from-track";

export type GeotagResult = {
  updated: { id: string; lat: number; lng: number }[];
  total: number; // photos that were missing a location (the match candidates)
  hadTimedTrack: boolean; // any track carried per-point timestamps
};

export async function geotagPostPhotos(postId: string): Promise<GeotagResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { updated: [], total: 0, hadTimedTrack: false };

  const { data: trackRows } = await supabase
    .from("tracks")
    .select("geojson")
    .eq("post_id", postId);
  const samples = trackSamples(
    (trackRows ?? []).map(
      (r) => r.geojson as GeoJSON.FeatureCollection<GeoJSON.LineString>,
    ),
  );
  if (samples.length === 0) return { updated: [], total: 0, hadTimedTrack: false };

  const { data: photoRows } = await supabase
    .from("photos")
    .select("id, taken_at, taken_at_offset_min, lat, lng")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  const targets = (photoRows ?? []).filter((p) => p.lat == null || p.lng == null);
  const times: PhotoTime[] = targets.map((p) => ({
    localMs: p.taken_at ? Date.parse(p.taken_at as string) : NaN,
    offsetMin: (p.taken_at_offset_min as number | null) ?? null,
  }));
  const placed = geotagPhotos(times, samples);

  const updated: { id: string; lat: number; lng: number }[] = [];
  for (let i = 0; i < targets.length; i++) {
    const pos = placed[i];
    if (!pos) continue;
    const id = targets[i].id as string;
    await supabase.from("photos").update({ lat: pos.lat, lng: pos.lng }).eq("id", id);
    updated.push({ id, lat: pos.lat, lng: pos.lng });
  }
  return { updated, total: targets.length, hadTimedTrack: true };
}
