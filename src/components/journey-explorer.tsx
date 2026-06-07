"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
} from "lucide-react";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import { useT } from "@/components/i18n";
import type { Track } from "@/lib/types";

export type JourneyStop = {
  id: string;
  type: "waypoint" | "photo";
  name: string;
  lat: number;
  lng: number;
  photoUrl?: string | null;
  caption?: string | null;
  href?: string;
};

function haversine(a: number[], b: number[]): number {
  const R = 6371000;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b[1] - a[1]);
  const dLon = r(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function JourneyExplorer({
  title,
  backHref,
  backLabel,
  stops,
  tracks,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  stops: JourneyStop[];
  tracks: Track[];
}) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Order the stops along the route so "next" walks the journey in sequence.
  const ordered = useMemo(() => {
    const coords: number[][] = [];
    for (const t of tracks)
      for (const f of t.geojson?.features ?? [])
        for (const c of f.geometry?.coordinates ?? []) coords.push(c);
    if (coords.length === 0) return stops;
    const key = (s: JourneyStop) => {
      let best = Infinity;
      let bestI = 0;
      for (let i = 0; i < coords.length; i++) {
        const d = haversine([s.lng, s.lat], coords[i]);
        if (d < best) {
          best = d;
          bestI = i;
        }
      }
      return bestI;
    };
    return [...stops].sort((a, b) => key(a) - key(b));
  }, [stops, tracks]);

  // Build the map once.
  useEffect(() => {
    if (!container.current || ordered.length === 0) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      center: [ordered[0].lng, ordered[0].lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // The full-screen container can finish sizing after the map mounts; keep the
    // canvas matched to it so it doesn't render short (leaving a black gap).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    map.on("load", () => {
      map.resize();
      const bounds = new maplibregl.LngLatBounds();

      tracks.forEach((t, i) => {
        const id = `track-${t.id ?? i}`;
        map.addSource(id, { type: "geojson", data: t.geojson });
        map.addLayer({
          id,
          type: "line",
          source: id,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#f56a1f", "line-width": 4, "line-opacity": 0.9 },
        });
        for (const f of t.geojson?.features ?? [])
          for (const c of f.geometry?.coordinates ?? []) bounds.extend([c[0], c[1]]);
      });

      ordered.forEach((s, i) => {
        bounds.extend([s.lng, s.lat]);
        const el = document.createElement("button");
        el.setAttribute("aria-label", s.name);
        if (s.type === "photo" && s.photoUrl) {
          el.style.cssText =
            "width:38px;height:38px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer";
          el.style.backgroundImage = `url(${optimizedSrc(s.photoUrl, 128, 70)})`;
        } else {
          el.className =
            "grid place-items-center size-7 rounded-full bg-[#f56a1f] text-[#0a0908] text-xs font-bold ring-2 ring-white/80 shadow-lg cursor-pointer";
          el.textContent = String(i + 1);
        }
        el.onclick = () => setIndex(i);
        new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      });

      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 0 });
    });

    return () => {
      ro.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to the active stop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || ordered.length === 0) return;
    const s = ordered[index];
    map.flyTo({ center: [s.lng, s.lat], zoom: 14.5, speed: 0.7, essential: true });
  }, [index, ordered]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightbox) {
        if (e.key === "Escape") setLightbox(null);
        return;
      }
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % ordered.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + ordered.length) % ordered.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered.length, lightbox]);

  const current = ordered[index];

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div ref={container} className="h-dvh w-full" />

      <Link
        href={backHref}
        className="glass absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-sand-50 transition hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> {t("journey.back", { label: backLabel })}
      </Link>

      {/* Stepper card */}
      {current && (
        <div className="absolute inset-x-0 bottom-0 z-20 p-4 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
          <div className="glass mx-auto w-full max-w-md rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-ember-300">
              {title} · {index + 1} / {ordered.length}
            </p>

            <div className="mt-2 flex items-center gap-3">
              {current.type === "photo" && current.photoUrl ? (
                <button
                  onClick={() => setLightbox(current.photoUrl!)}
                  className="relative size-16 shrink-0 overflow-hidden rounded-xl"
                  aria-label={t("journey.openPhoto")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={optimizedSrc(current.photoUrl, 256, 70)}
                    alt={current.caption ?? ""}
                    className="size-full object-cover"
                  />
                </button>
              ) : (
                <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-ember-500/15 text-ember-400">
                  <MapPin className="size-6" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-display text-lg font-semibold">
                  {current.type === "photo" && (
                    <Camera className="size-4 shrink-0 text-ember-400" />
                  )}
                  {current.name}
                </p>
                {current.type === "photo" && current.photoUrl && (
                  <button
                    onClick={() => setLightbox(current.photoUrl!)}
                    className="mt-0.5 text-xs text-ember-400 hover:underline"
                  >
                    {t("journey.openPhoto")}
                  </button>
                )}
                {current.href && (
                  <Link
                    href={current.href}
                    className="ml-3 mt-0.5 inline text-xs text-sand-100/60 hover:underline"
                  >
                    {t("journey.viewStory")}
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={() => setIndex((i) => (i - 1 + ordered.length) % ordered.length)}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-sm transition hover:border-white/25"
              >
                <ChevronLeft className="size-4" /> {t("journey.prev")}
              </button>
              <div className="flex gap-1">
                {ordered.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setIndex(i)}
                    aria-label={t("journey.goToStop", { n: i + 1 })}
                    className={`size-1.5 rounded-full transition ${
                      i === index ? "bg-ember-400" : "bg-white/25 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setIndex((i) => (i + 1) % ordered.length)}
                className="inline-flex items-center gap-1 rounded-full bg-ember-500 px-3 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
              >
                {t("journey.next")} <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/95 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            aria-label={t("common.close")}
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={optimizedSrc(lightbox, 2048, 80)}
            alt=""
            className="max-h-[88dvh] w-auto rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
