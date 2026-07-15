"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { LocationPicker } from "@/components/location-picker";
import { useT } from "@/components/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";

/**
 * A modal wrapper around the map LocationPicker, shared by the post editor and
 * the photo gallery. Edits a draft so Cancel discards; Save reports the final
 * coordinates (empty strings when cleared).
 *
 * Stays MOUNTED once opened and hides with CSS rather than unmounting: the map
 * inside costs a WebGL context + style parse + tile decode to build, and the
 * gallery opens this once per photo. Callers latch it mounted on first open, so
 * the ~200KB MapLibre chunk is still not fetched until then.
 */
export function LocationDialog({
  open,
  title,
  initialLat,
  initialLng,
  onClose,
  onSave,
  allowClear,
  tracks,
}: {
  open: boolean;
  title?: string;
  initialLat: string;
  initialLng: string;
  onClose: () => void;
  onSave: (lat: string, lng: string) => void;
  allowClear?: boolean;
  // Optional route geometry to draw on the picker (the map fits to it).
  tracks?: { id: string; geojson?: GeoJSON.FeatureCollection<GeoJSON.LineString> | null }[];
}) {
  const t = useT();
  const [lat, setLat] = useState(initialLat);
  const [lng, setLng] = useState(initialLng);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Sync the draft to the incoming coordinates during render, not in an effect:
  // the picker below frames its map on the commit where `open` flips, and child
  // effects run before the parent's — an effect here would land a commit late,
  // leaving the map framed on the previous photo.
  const [synced, setSynced] = useState({ open, initialLat, initialLng });
  if (
    synced.open !== open ||
    synced.initialLat !== initialLat ||
    synced.initialLng !== initialLng
  ) {
    setSynced({ open, initialLat, initialLng });
    if (open) {
      setLat(initialLat);
      setLng(initialLng);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  return (
    <div
      className={`fixed inset-0 z-[100] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm ${open ? "" : "hidden"}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label={title ?? t("admin.location.title")}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <MapPin className="size-4 text-ember-400" />
            {title ?? t("admin.location.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid size-8 place-items-center rounded-full text-sand-100/60 transition hover:bg-white/5 hover:text-sand-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          <p className="text-xs text-sand-100/60">
            {t("admin.editor.pickLocation")}
          </p>
          <LocationPicker
            open={open}
            lat={lat}
            lng={lng}
            tracks={tracks}
            onChange={(la, ln) => {
              setLat(la);
              setLng(ln);
            }}
            className="h-72 w-full overflow-hidden rounded-xl ring-1 ring-white/10"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder={t("admin.editor.lat")}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className={input}
              placeholder={t("admin.editor.lng")}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/5 px-5 py-3.5">
          {allowClear ? (
            <button
              onClick={() => {
                onSave("", "");
                onClose();
              }}
              className="text-sm text-red-400/80 transition hover:text-red-400"
            >
              {t("admin.location.clear")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm text-sand-100/70 transition hover:bg-white/5 hover:text-sand-50"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => {
                onSave(lat, lng);
                onClose();
              }}
              className="rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
            >
              {t("admin.location.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
