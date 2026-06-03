"use client";
import { useRef, useState } from "react";
import { Loader2, Route, Trash2, Upload } from "lucide-react";
import { parseGpx, formatDistance } from "@/lib/gpx";
import { getBrowserSupabase } from "@/lib/supabase/client";

export type ManagedTrack = {
  id: string;
  name: string | null;
  distance_m: number | null;
};

export function TrackManager({
  postId,
  tripId,
  slug,
  initial,
}: {
  postId: string;
  tripId: string | null;
  slug: string;
  initial: ManagedTrack[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<ManagedTrack[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revalidate() {
    try {
      await fetch("/api/admin/revalidate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: `/posts/${slug}` }),
      });
    } catch {
      /* best effort */
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Storage isn’t available.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const added: ManagedTrack[] = [];
      for (const file of Array.from(files)) {
        const xml = await file.text();
        const parsed = parseGpx(xml);
        const { data, error } = await supabase
          .from("tracks")
          .insert({
            post_id: postId,
            trip_id: tripId,
            name: parsed.name ?? file.name.replace(/\.gpx$/i, ""),
            geojson: parsed.geojson,
            distance_m: parsed.distanceM,
          })
          .select("id, name, distance_m")
          .single();
        if (error) throw new Error(error.message);
        added.push(data as ManagedTrack);
      }
      setTracks((t) => [...t, ...added]);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that GPX.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(track: ManagedTrack) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setTracks((ts) => ts.filter((x) => x.id !== track.id));
    await supabase.from("tracks").delete().eq("id", track.id);
    revalidate();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">Routes</h2>
        <p className="mt-0.5 text-sm text-sand-100/50">
          Upload GPX tracks to draw the journey on the map. Saved automatically.
        </p>
      </div>

      {tracks.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm">
                <Route className="size-4 text-ember-400" />
                {t.name || "Track"}
                {t.distance_m ? (
                  <span className="text-sand-100/40">
                    · {formatDistance(t.distance_m)}
                  </span>
                ) : null}
              </span>
              <button
                onClick={() => remove(t)}
                aria-label="Delete track"
                className="text-red-400/80 transition hover:text-red-400"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? "Reading…" : "Upload GPX"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
