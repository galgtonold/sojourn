"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPin } from "lucide-react";
import type { Photo } from "@/lib/types";
import { optimizedSrc, cn } from "@/lib/utils";
import { coverFromPhotos } from "@/lib/post-editor-layout";
import { ImageUploader } from "@/components/image-uploader";
import { DateField } from "@/components/date-field";
import { useT } from "@/components/i18n";

// The second static path into MapLibre — photo-manager has the other one.
// Splitting only one leaves the chunk in the editor's first load. The call
// site below only mounts this element while the picker is open, so the chunk
// fetch itself is deferred until then too — not just the parse cost.
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

const input =
  "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

// One label style for every field here, matching the group headers above the
// section. Before this the fields were a mix of sentence-case labels, bare
// placeholders and no label at all, which is what made the panel read as
// unfinished next to the rest of the editor.
const label = "mb-1.5 block text-xs uppercase tracking-[0.18em] text-sand-100/50";

export function DetailsStage({
  cover_image,
  cover_alt,
  location,
  lat,
  lng,
  date,
  excerpt,
  photos,
  onField,
  onLatLng,
}: {
  cover_image: string;
  cover_alt: string;
  location: string;
  lat: string;
  lng: string;
  date: string;
  excerpt: string;
  photos: Photo[];
  onField: (key: "cover_image" | "cover_alt" | "location" | "date" | "excerpt", value: string) => void;
  onLatLng: (lat: string, lng: string) => void;
}) {
  const t = useT();
  const [locOpen, setLocOpen] = useState(false);
  // Mount on first open and stay mounted: the dialog's map is expensive to
  // rebuild. The dynamic() import above still defers the MapLibre chunk until
  // that first open.
  const [locEverOpened, setLocEverOpened] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const coverId = coverFromPhotos(cover_image, photos);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <p className={label}>{t("admin.editor.cover.title")}</p>
          {photos.length > 0 ? (
            // p-1 / -m-1: the selected thumbnail's ring is painted OUTSIDE its
            // box, and `overflow-x-auto` clips both axes — so without room to
            // breathe the highlight lost its top edge and, at either end of the
            // strip, its side. The negative margin keeps the row visually
            // flush with the label.
            <div className="-m-1 flex gap-2 overflow-x-auto p-1">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onField("cover_image", p.url ?? "")}
                  aria-label={t("admin.editor.cover.pick")}
                  aria-pressed={coverId === p.id}
                  className={cn(
                    "h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition",
                    coverId === p.id
                      ? "ring-ember-400"
                      : "ring-transparent hover:ring-white/30",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizedSrc(p.url ?? "", 192, 60)} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-sand-100/50">
              {t("admin.editor.cover.none")}
            </p>
          )}
          <div className="mt-2">
            <ImageUploader value={cover_image} onChange={(url) => onField("cover_image", url)} label="" />
          </div>
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="mt-2 text-xs text-ember-400 hover:underline"
          >
            {t("admin.editor.cover.advanced")}
          </button>
          {advanced && (
            <div className="mt-2 space-y-2">
              <input
                className={input}
                placeholder={t("admin.editor.coverUrl")}
                value={cover_image}
                onChange={(e) => onField("cover_image", e.target.value)}
              />
              <input
                className={input}
                placeholder={t("admin.editor.coverAlt")}
                value={cover_alt}
                onChange={(e) => onField("cover_alt", e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className={label} htmlFor="post-place">
              {t("admin.editor.details.place")}
            </label>
            <input
              id="post-place"
              className={input}
              placeholder={t("admin.editor.location")}
              value={location}
              onChange={(e) => onField("location", e.target.value)}
            />
          </div>

          <div>
            <p className={label}>{t("admin.editor.details.pin")}</p>
            <button
              type="button"
              onClick={() => {
                setLocEverOpened(true);
                setLocOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-left text-sm transition hover:border-ember-400"
            >
              <MapPin className="size-4 shrink-0 text-ember-400" />
              <span
                className={cn(
                  "flex-1 truncate",
                  lat && lng ? "text-sand-100/90" : "text-sand-100/50",
                )}
              >
                {lat && lng ? `${lat}, ${lng}` : t("admin.location.none")}
              </span>
              <span className="shrink-0 text-xs font-medium text-ember-400">
                {lat && lng ? t("admin.location.change") : t("admin.location.set")}
              </span>
            </button>
          </div>

          <div>
            <label className={label} htmlFor="post-date">
              {t("admin.editor.date")}
            </label>
            <DateField id="post-date" value={date} onChange={(v) => onField("date", v)} />
          </div>
        </div>
      </div>

      {/* Full width, and taller. This is the text that has to sell the entry on
          a card and in a link preview, and two cramped rows invited two cramped
          sentences. */}
      <div>
        <label className={label} htmlFor="post-summary">
          {t("admin.editor.details.summary")}
        </label>
        <textarea
          id="post-summary"
          className={`${input} min-h-[6.5rem] resize-y leading-relaxed`}
          rows={4}
          placeholder={t("admin.editor.excerpt")}
          value={excerpt}
          onChange={(e) => onField("excerpt", e.target.value)}
        />
        <p className="mt-1.5 text-xs text-sand-100/50">
          {t("admin.editor.details.summaryHint")}
        </p>
      </div>

      {locEverOpened && (
        <LocationDialog
          open={locOpen}
          initialLat={lat}
          initialLng={lng}
          onClose={() => setLocOpen(false)}
          onSave={(la, ln) => onLatLng(la, ln)}
          allowClear
        />
      )}
    </div>
  );
}
