"use client";
import { useState } from "react";
import { MapPin } from "lucide-react";
import type { Photo } from "@/lib/types";
import { optimizedSrc, cn } from "@/lib/utils";
import { coverFromPhotos } from "@/lib/post-editor-layout";
import { ImageUploader } from "@/components/image-uploader";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";

// The second static path into MapLibre — photo-manager has the other one.
// Splitting only one leaves the chunk in the editor's first load.
const LocationDialog = dynamic(
  () => import("@/components/location-dialog").then((m) => m.LocationDialog),
  { ssr: false },
);

const input =
  "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

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
  const [advanced, setAdvanced] = useState(false);
  const coverId = coverFromPhotos(cover_image, photos);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-1.5 text-sm text-sand-100/60">{t("admin.editor.cover.title")}</p>
        {photos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onField("cover_image", p.url ?? "")}
                aria-label={t("admin.editor.cover.pick")}
                className={cn(
                  "h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition",
                  coverId === p.id ? "ring-ember-400" : "ring-transparent hover:ring-white/30",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={optimizedSrc(p.url ?? "", 192, 60)} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-sand-100/60">{t("admin.editor.cover.none")}</p>
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

      <div className="space-y-3">
        <label className="block text-sm text-sand-100/60">
          {t("admin.editor.details.place")}
          <input
            className={`${input} mt-1`}
            placeholder={t("admin.editor.location")}
            value={location}
            onChange={(e) => onField("location", e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => setLocOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-left text-sm transition hover:border-ember-400"
        >
          <MapPin className="size-4 shrink-0 text-ember-400" />
          <span className="flex-1 truncate text-sand-100/80">
            {lat && lng ? `${lat}, ${lng}` : t("admin.location.none")}
          </span>
          <span className="shrink-0 text-xs font-medium text-ember-400">
            {lat && lng ? t("admin.location.change") : t("admin.location.set")}
          </span>
        </button>
        <label className="block text-sm text-sand-100/60">
          {t("admin.editor.date")}
          <input
            type="date"
            className={`${input} mt-1`}
            value={date}
            onChange={(e) => onField("date", e.target.value)}
          />
        </label>
        <textarea
          className={`${input} resize-y`}
          rows={2}
          placeholder={t("admin.editor.excerpt")}
          value={excerpt}
          onChange={(e) => onField("excerpt", e.target.value)}
        />
      </div>

      <LocationDialog
        open={locOpen}
        initialLat={lat}
        initialLng={lng}
        onClose={() => setLocOpen(false)}
        onSave={(la, ln) => onLatLng(la, ln)}
        allowClear
      />
    </div>
  );
}
