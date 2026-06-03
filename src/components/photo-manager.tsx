"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, MapPin, Trash2 } from "lucide-react";
import { uploadImage } from "@/lib/upload-client";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type ManagedPhoto = {
  id: string;
  url: string | null;
  storage_path: string | null;
  caption: string | null;
  alt: string | null;
  lat: number | null;
  lng: number | null;
  sort_order: number;
};

/** Gallery management for an existing post: upload, caption, delete. */
export function PhotoManager({
  postId,
  slug,
  initial,
}: {
  postId: string;
  slug: string;
  initial: ManagedPhoto[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<ManagedPhoto[]>(initial);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Bust the cached public post page so gallery changes appear immediately.
  async function revalidate() {
    try {
      await fetch("/api/admin/revalidate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: `/posts/${slug}` }),
      });
    } catch {
      // best effort
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
      let order = photos.length;
      const added: ManagedPhoto[] = [];
      for (const file of Array.from(files)) {
        const { url, path, lat, lng, takenAt } = await uploadImage(file, postId);
        const { data, error } = await supabase
          .from("photos")
          .insert({
            post_id: postId,
            url,
            storage_path: path,
            lat,
            lng,
            taken_at: takenAt,
            sort_order: order++,
          })
          .select("id, url, storage_path, caption, alt, lat, lng, sort_order")
          .single();
        if (error) throw new Error(error.message);
        added.push(data as ManagedPhoto);
      }
      setPhotos((p) => [...p, ...added]);
      revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: ManagedPhoto) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    await supabase.from("photos").delete().eq("id", photo.id);
    if (photo.storage_path) {
      await supabase.storage.from("photos").remove([photo.storage_path]);
    }
    revalidate();
  }

  async function saveField(
    photo: ManagedPhoto,
    field: "caption" | "alt",
  ) {
    const supabase = getBrowserSupabase();
    await supabase
      ?.from("photos")
      .update({ [field]: photo[field] })
      .eq("id", photo.id);
    setSavedId(photo.id);
    setTimeout(() => setSavedId((id) => (id === photo.id ? null : id)), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Gallery</h2>
          <p className="mt-0.5 text-sm text-sand-100/50">
            Saved automatically — uploads, captions and deletions apply
            instantly (no need to press Save).
          </p>
        </div>
        <span className="shrink-0 text-sm text-sand-100/50">
          {photos.length} photos
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="space-y-1.5">
            <div className="group relative aspect-square overflow-hidden rounded-2xl bg-ink-800">
              {photo.url && (
                <Image
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label="Delete photo"
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink-950/70 text-red-300 opacity-0 transition group-hover:opacity-100 hover:bg-ink-950"
              >
                <Trash2 className="size-4" />
              </button>
              {photo.lat != null && photo.lng != null && (
                <span
                  title="Geotagged from EXIF — shows on the map"
                  className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-0.5 text-[10px] text-lagoon-400"
                >
                  <MapPin className="size-3" /> Located
                </span>
              )}
            </div>
            <div className="relative">
              <input
                defaultValue={photo.caption ?? ""}
                placeholder="Caption…"
                onChange={(e) => (photo.caption = e.target.value)}
                onBlur={() => saveField(photo, "caption")}
                className="w-full rounded-lg border border-white/10 bg-ink-800 px-2 py-1 pr-12 text-xs outline-none focus:border-ember-400"
              />
              {savedId === photo.id && (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-lagoon-400">
                  Saved ✓
                </span>
              )}
            </div>
            <input
              defaultValue={photo.alt ?? ""}
              placeholder="Alt text…"
              onChange={(e) => (photo.alt = e.target.value)}
              onBlur={() => saveField(photo, "alt")}
              className="w-full rounded-lg border border-white/10 bg-ink-800 px-2 py-1 text-xs text-sand-100/70 outline-none focus:border-ember-400"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-xs transition",
            dragging
              ? "border-ember-400 bg-ember-500/5 text-ember-300"
              : "border-white/15 text-sand-100/50 hover:border-white/30",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
          {busy ? "Uploading…" : "Add photos"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
