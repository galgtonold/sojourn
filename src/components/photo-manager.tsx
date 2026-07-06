"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Code2, ImagePlus, Loader2, MapPin, PlayCircle, Trash2 } from "lucide-react";
import { uploadImage, uploadVideo } from "@/lib/upload-client";
import { mediaKind } from "@/lib/media-kind";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { geotagPostPhotos } from "@/lib/geotag-photos";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";
import { LocationDialog } from "@/components/location-dialog";

export type ManagedPhoto = {
  id: string;
  url: string | null;
  storage_path: string | null;
  caption: string | null;
  alt: string | null;
  lat: number | null;
  lng: number | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  media_type?: "image" | "video";
  poster_url?: string | null;
  sort_order: number;
};

/** Gallery management for an existing post: upload, caption, delete. */
const PHOTO_COLUMNS =
  "id, url, storage_path, caption, alt, lat, lng, width, height, blurhash, media_type, poster_url, sort_order";

export function PhotoManager({
  postId,
  slug,
  initial,
  onListChange,
  refreshKey = 0,
}: {
  postId: string;
  slug: string;
  initial: ManagedPhoto[];
  // Mirrors the live photo list up so the article's insert bar can offer a
  // freshly-uploaded photo without a page reload.
  onListChange?: (photos: ManagedPhoto[]) => void;
  // Bumped by the parent after the AI writes captions/descriptions server-side,
  // so the grid re-pulls and the labels appear without a manual reload. The
  // caption fields are uncontrolled, so a re-fetch alone wouldn't update them —
  // they're keyed on refreshKey below to remount with the fresh value.
  refreshKey?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<ManagedPhoto[]>(initial);
  useEffect(() => {
    onListChange?.(photos);
  }, [photos, onListChange]);
  // Re-pull the post's photos when the parent signals an external change (an AI
  // captioning pass). Skipped on first mount (refreshKey 0) — we already have
  // `initial`.
  useEffect(() => {
    if (!refreshKey) return;
    let cancelled = false;
    (async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from("photos")
        .select(PHOTO_COLUMNS)
        .eq("post_id", postId)
        .order("sort_order", { ascending: true });
      if (!cancelled && data) setPhotos(data as ManagedPhoto[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, postId]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [locPhoto, setLocPhoto] = useState<ManagedPhoto | null>(null);
  const t = useT();
  const confirm = useConfirm();

  async function saveLocation(photo: ManagedPhoto, latS: string, lngS: string) {
    const lat = latS.trim() === "" ? null : Number(latS);
    const lng = lngS.trim() === "" ? null : Number(lngS);
    if (lat != null && !Number.isFinite(lat)) return;
    if (lng != null && !Number.isFinite(lng)) return;
    setPhotos((ps) =>
      ps.map((x) => (x.id === photo.id ? { ...x, lat, lng } : x)),
    );
    const supabase = getBrowserSupabase();
    await supabase?.from("photos").update({ lat, lng }).eq("id", photo.id);
    revalidate();
  }

  // Place photos that have no location by matching their capture time to a
  // timestamped GPX track for this post. Re-runnable; never overwrites a pin.
  async function locateFromTrack() {
    setBusy(true);
    setError(null);
    setGeoMsg(null);
    try {
      const { updated, total, hadTimedTrack } = await geotagPostPhotos(postId);
      if (!hadTimedTrack) {
        setError(t("admin.gallery.geo.noTimes"));
        return;
      }
      if (updated.length) {
        setPhotos((ps) =>
          ps.map((x) => {
            const u = updated.find((y) => y.id === x.id);
            return u ? { ...x, lat: u.lat, lng: u.lng } : x;
          }),
        );
      }
      setGeoMsg(t("admin.gallery.geo.done", { n: updated.length, total }));
      revalidate();
    } catch {
      setError(t("admin.gallery.geo.err"));
    } finally {
      setBusy(false);
    }
  }

  async function copyTag(photo: ManagedPhoto) {
    try {
      await navigator.clipboard.writeText(`[photo:${photo.id}]`);
      setCopiedId(photo.id);
      setTimeout(() => setCopiedId((id) => (id === photo.id ? null : id)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

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
    setBusy(true);
    setError(null);
    try {
      let order = photos.length;
      const added: ManagedPhoto[] = [];
      for (const file of Array.from(files)) {
        const kind = mediaKind(file.type);
        if (kind === null) {
          setError(
            file.type.startsWith("video/")
              ? t("admin.err.videoFormat")
              : t("admin.err.uploadFailed"),
          );
          continue;
        }
        if (kind === "video" && file.size > 52428800) {
          setError(t("admin.err.videoTooLarge"));
          continue;
        }
        const res =
          kind === "video"
            ? await uploadVideo(file, postId)
            : await uploadImage(file, postId);
        const { data, error } = await supabase
          .from("photos")
          .insert({
            post_id: postId,
            url: res.url,
            storage_path: res.path,
            media_type: res.mediaType,
            poster_url: res.posterUrl,
            poster_path: res.posterPath,
            lat: res.lat,
            lng: res.lng,
            taken_at: res.takenAt,
            taken_at_offset_min: res.takenOffsetMin,
            width: res.width,
            height: res.height,
            blurhash: res.blurhash,
            sort_order: order++,
          })
          .select(PHOTO_COLUMNS)
          .single();
        if (error) throw new Error(error.message);
        added.push(data as ManagedPhoto);
      }
      setPhotos((p) => [...p, ...added]);
      revalidate();
      // Enrich each new photo (vision description + place name) in the
      // background — best effort, never blocks the upload.
      for (const photo of added) {
        if (photo.media_type === "video") continue;
        fetch("/api/admin/ai/enrich-photo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ photoId: photo.id }),
        }).catch(() => {});
      }
      // Auto-place the new photos from a timestamped track (best-effort; the
      // matcher only fills photos that arrived without GPS). Silent unless it
      // actually places some.
      try {
        const { updated, total } = await geotagPostPhotos(postId);
        if (updated.length) {
          setPhotos((ps) =>
            ps.map((x) => {
              const u = updated.find((y) => y.id === x.id);
              return u ? { ...x, lat: u.lat, lng: u.lng } : x;
            }),
          );
          setGeoMsg(t("admin.gallery.geo.done", { n: updated.length, total }));
        }
      } catch {
        /* auto-geotag is best-effort */
      }
    } catch {
      setError(t("admin.err.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: ManagedPhoto) {
    const ok = await confirm({
      message: t("admin.gallery.deleteConfirm"),
      danger: true,
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    const supabase = getBrowserSupabase();
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    await supabase.from("photos").delete().eq("id", photo.id);
    if (photo.storage_path) {
      await supabase.storage.from("photos").remove([photo.storage_path]);
    }
    revalidate();
  }

  async function saveCaption(photo: ManagedPhoto) {
    const supabase = getBrowserSupabase();
    await supabase
      ?.from("photos")
      .update({ caption: photo.caption })
      .eq("id", photo.id);
    setSavedId(photo.id);
    setTimeout(() => setSavedId((id) => (id === photo.id ? null : id)), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">
            {t("admin.gallery.title")}
          </h2>
          <p className="mt-0.5 text-sm text-sand-100/50">
            {t("admin.gallery.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Camera capture — opens the camera directly on mobile; on desktop
              this falls back to the normal file picker. */}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-sand-100/70 transition hover:border-white/30 hover:text-sand-50 sm:hidden"
          >
            <Camera className="size-4" />
            {t("admin.gallery.camera")}
          </button>
          <span className="text-sm text-sand-100/50">
            {t("admin.gallery.photos", { n: photos.length })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          <div key={photo.id} className="space-y-1.5">
            <div className="group relative aspect-square overflow-hidden rounded-2xl bg-ink-800">
              {photo.media_type === "video" ? (
                <>
                  {photo.poster_url ? (
                    <Image
                      src={photo.poster_url}
                      alt={photo.caption ?? ""}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-ink-800" />
                  )}
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <PlayCircle className="size-10 text-white/90 drop-shadow" />
                  </span>
                </>
              ) : (
                photo.url && (
                  <Image
                    src={photo.url}
                    alt={photo.caption ?? ""}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                )
              )}
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label={t("admin.gallery.delete")}
                className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-ink-950/70 text-red-300 transition hover:bg-ink-950 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
              {photo.lat != null && photo.lng != null && (
                <span
                  title={t("admin.gallery.geotagged")}
                  className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-0.5 text-[10px] text-sage-400"
                >
                  <MapPin className="size-3" /> {t("admin.gallery.located")}
                </span>
              )}
            </div>
            <div className="relative">
              {/* Wrapping, fixed-height textarea: it wraps (so long captions
                  stay tappable on mobile, never cut off horizontally) and every
                  box is the same height, so the caption/alt/action rows line up
                  across the grid. Longer text scrolls within the box. */}
              <textarea
                key={`${photo.id}-${refreshKey}`}
                defaultValue={photo.caption ?? ""}
                placeholder={t("admin.gallery.caption")}
                onChange={(e) => (photo.caption = e.target.value)}
                onBlur={() => saveCaption(photo)}
                rows={2}
                className="h-16 w-full resize-none overflow-y-auto rounded-lg border border-white/10 bg-ink-800 px-2 py-1 text-xs leading-snug outline-none focus:border-ember-400"
              />
              {savedId === photo.id && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-[10px] font-medium text-sage-400 shadow">
                  {t("admin.gallery.saved")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => copyTag(photo)}
                className="inline-flex items-center gap-1 text-[10px] text-ember-400 hover:underline"
              >
                <Code2 className="size-3" />
                {copiedId === photo.id
                  ? t("admin.gallery.copied")
                  : t("admin.gallery.copyTag")}
              </button>
              <button
                type="button"
                onClick={() => setLocPhoto(photo)}
                className="inline-flex items-center gap-1 text-[10px] text-sand-100/60 transition hover:text-ember-400 hover:underline"
              >
                <MapPin className="size-3" />
                {photo.lat != null
                  ? t("admin.location.change")
                  : t("admin.location.set")}
              </button>
            </div>
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
          {busy ? t("admin.upload.uploading") : t("admin.gallery.addMedia")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={locateFromTrack}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MapPin className="size-4" />
          )}
          {busy ? t("admin.gallery.geo.busy") : t("admin.gallery.geo.button")}
        </button>
        {geoMsg && <span className="text-sm text-sand-100/70">{geoMsg}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/webm"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}

      <LocationDialog
        open={!!locPhoto}
        title={t("admin.location.photoTitle")}
        initialLat={locPhoto?.lat != null ? String(locPhoto.lat) : ""}
        initialLng={locPhoto?.lng != null ? String(locPhoto.lng) : ""}
        onClose={() => setLocPhoto(null)}
        onSave={(la, ln) => locPhoto && saveLocation(locPhoto, la, ln)}
        allowClear
      />
    </div>
  );
}
