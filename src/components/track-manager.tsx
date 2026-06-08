"use client";
import { useRef, useState } from "react";
import { Loader2, Route, Trash2, Upload } from "lucide-react";
import { parseGpx, formatDistance } from "@/lib/gpx";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

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
  const t = useT();

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
            started_at: parsed.startedAt,
            ended_at: parsed.endedAt,
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
        <h2 className="font-display text-2xl font-semibold">
          {t("admin.routes.title")}
        </h2>
        <p className="mt-0.5 text-sm text-sand-100/50">
          {t("admin.routes.subtitle")}
        </p>
      </div>

      {tracks.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
          {tracks.map((tk) => (
            <li key={tk.id} className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm">
                <Route className="size-4 text-ember-400" />
                {tk.name || t("admin.routes.track")}
                {tk.distance_m ? (
                  <span className="text-sand-100/40">
                    · {formatDistance(tk.distance_m)}
                  </span>
                ) : null}
              </span>
              <button
                onClick={() => remove(tk)}
                aria-label={t("admin.routes.delete")}
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
        {busy ? t("admin.routes.reading") : t("admin.routes.upload")}
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
