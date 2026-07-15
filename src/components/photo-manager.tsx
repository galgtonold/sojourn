"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Reorder } from "framer-motion";
import {
  ArrowDownUp,
  Camera,
  Check,
  Code2,
  GripVertical,
  ImagePlus,
  Loader2,
  MapPin,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { uploadImage, uploadVideo } from "@/lib/upload-client";
import { validateUploadFile, uploadResultToRow } from "@/lib/photo-upload";
import { nextSortOrder, reconcilePhotoOrder } from "@/lib/photo-order";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { geotagPostPhotos } from "@/lib/geotag-photos";
import { updatePhotoFields } from "@/lib/db/photos-client";
import { revalidatePublicPost } from "@/lib/revalidate-client";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";
import dynamic from "next/dynamic";
import type { ManagedTrack } from "@/components/track-manager";

// MapLibre (~200KB) rides in behind LocationDialog, and most editing sessions
// never open the picker — so it must not be in the editor's first load. Same
// split the public post-view already does for the same map. Client-only anyway.
// The call site below only mounts this element while the picker is open, so
// the chunk fetch itself is deferred until then too — not just the parse cost.
const LocationDialog = dynamic(
  () => import("@/components/location-dialog").then((m) => m.LocationDialog),
  {
    ssr: false,
    // Chunk fetch takes a beat on a slow connection; without this a click on
    // "set location" shows nothing until it lands.
    loading: () => (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-ink-950/70 backdrop-blur-sm">
        <Loader2 className="size-6 animate-spin text-ember-400" />
      </div>
    ),
  },
);

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
  initialManualOrder = false,
  onListChange,
  refreshKey = 0,
  tracks = [],
}: {
  postId: string;
  slug: string;
  initial: ManagedPhoto[];
  // The post's tracks (with geometry), drawn on the per-photo location picker so
  // the author can place a photo relative to the recorded route.
  tracks?: ManagedTrack[];
  // Whether the author hand-arranged this post's photos. When false, a new
  // upload re-sorts the gallery by capture time; when true it just appends.
  initialManualOrder?: boolean;
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
  // Tracks whether the gallery is hand-ordered. A ref mirror lets the async
  // upload flow read the latest value without being re-created each render.
  const [manualOrder, setManualOrder] = useState(initialManualOrder);
  const manualRef = useRef(manualOrder);
  manualRef.current = manualOrder;
  // Toggles the drag-to-reorder list view.
  const [reordering, setReordering] = useState(false);
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
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!cancelled && data) setPhotos(data as ManagedPhoto[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, postId]);
  const [busy, setBusy] = useState(false);
  // Live count while a multi-file upload runs, so the author sees how far it got
  // (paired with each photo appearing in the grid the moment it lands).
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
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
    const prev = { lat: photo.lat, lng: photo.lng };
    setPhotos((ps) =>
      ps.map((x) => (x.id === photo.id ? { ...x, lat, lng } : x)),
    );
    try {
      await updatePhotoFields(photo.id, { lat, lng });
      revalidatePublicPost(slug);
    } catch {
      // Roll the optimistic pin back so the map doesn't show a location that
      // never saved.
      setPhotos((ps) =>
        ps.map((x) => (x.id === photo.id ? { ...x, ...prev } : x)),
      );
      setError(t("admin.err.save"));
    }
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
      revalidatePublicPost(slug);
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

  // Persist a photo order server-side. Returns the authoritative id order (the
  // server validates ids and denses the sort_order), or null on failure.
  async function requestReorder(body: {
    order?: string[];
    mode?: "time";
  }): Promise<string[] | null> {
    try {
      const res = await fetch("/api/admin/photos/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as { order?: string[] };
      if (!res.ok) return null;
      return j.order ?? null;
    } catch {
      return null;
    }
  }

  // Reorder local state to match an id order coming back from the server.
  function applyOrder(ids: string[]) {
    setPhotos((ps) => reconcilePhotoOrder(ps, ids));
  }

  // (Re)apply chronological order by capture time; clears the manual flag.
  async function sortByTime() {
    setBusy(true);
    setError(null);
    setGeoMsg(null);
    try {
      const ids = await requestReorder({ mode: "time" });
      if (!ids) {
        setError(t("admin.err.uploadFailed"));
        return;
      }
      applyOrder(ids);
      setManualOrder(false);
      setGeoMsg(t("admin.gallery.sortedByTime"));
      revalidatePublicPost(slug);
    } finally {
      setBusy(false);
    }
  }

  // Save the current hand-arranged order and leave reorder mode.
  async function saveManualOrder() {
    setReordering(false);
    setManualOrder(true);
    const ids = await requestReorder({ order: photos.map((p) => p.id) });
    if (ids) applyOrder(ids);
    revalidatePublicPost(slug);
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const supabase = getBrowserSupabase();
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: list.length });
    try {
      // Collision-free: start past the current highest sort_order (not the
      // count, which duplicated/skipped values when a slow upload landed late).
      let order = nextSortOrder(photos);
      const added: ManagedPhoto[] = [];
      const failed: string[] = [];
      for (const file of list) {
        const check = validateUploadFile(file);
        if (!check.ok) {
          failed.push(file.name);
          setProgress((pr) => (pr ? { ...pr, done: pr.done + 1 } : pr));
          continue;
        }
        // Upload each file on its own: one bad file (unsupported, too large, a
        // network blip, a storage error) must NOT abort the rest of a multi-file
        // selection — the good ones still upload and we list which didn't.
        try {
          const res =
            check.kind === "video"
              ? await uploadVideo(file, postId)
              : await uploadImage(file, postId);
          const { data, error } = await supabase
            .from("photos")
            .insert(uploadResultToRow(res, postId, order++))
            .select(PHOTO_COLUMNS)
            .single();
          if (error) throw new Error(error.message);
          const photo = data as ManagedPhoto;
          added.push(photo);
          // Reveal each photo the moment it lands, so a big batch fills the grid
          // progressively instead of appearing all at once at the end.
          setPhotos((p) => [...p, photo]);
        } catch (e) {
          // Keep the real reason in the console for diagnosis; the user sees a
          // plain list of the files that didn't make it.
          console.error(`[upload] ${file.name} failed:`, e);
          failed.push(file.name);
        } finally {
          setProgress((pr) => (pr ? { ...pr, done: pr.done + 1 } : pr));
        }
      }
      if (added.length) {
        revalidatePublicPost(slug);
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
        // Keep the gallery chronological unless the author hand-arranged it — so
        // a fresh upload (including a timestamp-less camera import, which sorts
        // to the end) slots in by capture time instead of wherever it landed.
        if (!manualRef.current) {
          const ids = await requestReorder({ mode: "time" });
          if (ids) applyOrder(ids);
        }
      }
      if (failed.length) {
        setError(t("admin.gallery.uploadFailed", { list: failed.join(", ") }));
      }
    } catch {
      setError(t("admin.err.uploadFailed"));
    } finally {
      setBusy(false);
      setProgress(null);
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
    revalidatePublicPost(slug);
  }

  async function saveCaption(photo: ManagedPhoto) {
    const caption = photo.caption;
    try {
      await updatePhotoFields(photo.id, { caption });
      // Lift the edit into state immutably so the parent's `photos` — which feeds
      // the article editor's [photo:] chip labels — re-renders with the new
      // caption. The textarea is uncontrolled and mutates `photo` in place, which
      // never changes the array identity, so onListChange (and thus the editor)
      // never saw a caption edit until a full refetch (e.g. an AI pass bumping
      // refreshKey).
      setPhotos((ps) => ps.map((x) => (x.id === photo.id ? { ...x, caption } : x)));
      // Refresh the cached public page too, so an edited caption shows there
      // without waiting for another revalidation trigger (every other gallery
      // mutation already does this).
      revalidatePublicPost(slug);
      setSavedId(photo.id);
      setTimeout(() => setSavedId((id) => (id === photo.id ? null : id)), 1500);
    } catch {
      setError(t("admin.err.save"));
    }
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

      {reordering ? (
        <div className="space-y-3">
          <p className="text-sm text-sand-100/60">
            {t("admin.gallery.reorderHint")}
          </p>
          <Reorder.Group
            axis="y"
            values={photos}
            onReorder={setPhotos}
            className="space-y-2"
          >
            {photos.map((photo) => {
              const thumb =
                photo.media_type === "video" ? photo.poster_url : photo.url;
              return (
                <Reorder.Item
                  key={photo.id}
                  value={photo}
                  className="flex touch-none cursor-grab items-center gap-3 rounded-xl border border-white/10 bg-ink-800 p-2 active:cursor-grabbing"
                >
                  <GripVertical className="size-4 shrink-0 text-sand-100/40" />
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-900">
                    {thumb && (
                      <Image
                        src={thumb}
                        alt={photo.caption ?? ""}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <span className="line-clamp-2 flex-1 text-xs text-sand-100/70">
                    {photo.caption?.trim() || t("admin.gallery.caption")}
                  </span>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          <button
            type="button"
            onClick={saveManualOrder}
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
          >
            <Check className="size-4" /> {t("admin.gallery.reorderDone")}
          </button>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo) => (
          // id + scroll margin so a click on the photo's chip in the article
          // editor can scroll this card into view (and briefly ring it).
          <div
            key={photo.id}
            id={`gallery-photo-${photo.id}`}
            className="scroll-mt-24 space-y-1.5 rounded-xl transition-shadow"
          >
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
          {!busy ? (
            t("admin.gallery.addMedia")
          ) : progress ? (
            <span className="flex w-full flex-col items-center gap-1.5 px-3">
              <span className="tabular-nums">
                {progress.done} / {progress.total}
              </span>
              <span className="h-1 w-full max-w-20 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-ember-500 transition-all duration-300"
                  style={{
                    width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                  }}
                />
              </span>
            </span>
          ) : (
            t("admin.upload.uploading")
          )}
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
        {photos.length >= 2 && (
          <>
            <button
              type="button"
              onClick={() => setReordering(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 disabled:opacity-50"
            >
              <GripVertical className="size-4" /> {t("admin.gallery.reorder")}
            </button>
            <button
              type="button"
              onClick={sortByTime}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 disabled:opacity-50"
            >
              <ArrowDownUp className="size-4" /> {t("admin.gallery.sortByTime")}
            </button>
          </>
        )}
        {geoMsg && <span className="text-sm text-sand-100/70">{geoMsg}</span>}
      </div>
        </>
      )}

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

      {!!locPhoto && (
        <LocationDialog
          open={!!locPhoto}
          title={t("admin.location.photoTitle")}
          initialLat={locPhoto?.lat != null ? String(locPhoto.lat) : ""}
          initialLng={locPhoto?.lng != null ? String(locPhoto.lng) : ""}
          onClose={() => setLocPhoto(null)}
          onSave={(la, ln) => locPhoto && saveLocation(locPhoto, la, ln)}
          allowClear
          tracks={tracks}
        />
      )}
    </div>
  );
}
