"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import { addTracksLayer } from "@/lib/map-tracks";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import { buildConnectorSegments, orderJourneyStops } from "@/lib/journey-connector";
import { blurhashToDataURL } from "@/lib/blurhash";
import { BlurImg } from "@/components/blur-img";
import { initialView } from "@/components/trip-map";
import { ImageLightbox } from "@/components/image-lightbox";
import { useI18n } from "@/components/i18n";
import type { Locale } from "@/lib/i18n";
import type {
  PhotoTranslation,
  PostTranslation,
  Track,
  TripTranslation,
} from "@/lib/types";

export type JourneyStop = {
  id: string;
  type: "waypoint" | "photo";
  name: string;
  lat: number;
  lng: number;
  // The sequence the author chose (posts oldest→newest × gallery sort_order),
  // assigned by the page. When present it drives the walk order directly.
  order?: number;
  photoUrl?: string | null;
  blurhash?: string | null;
  caption?: string | null;
  takenAt?: string | null;
  href?: string;
  // Translations carried raw so the explorer can localize on the client (the
  // page is statically rendered in the default locale). `postTitle` is the
  // fallback label for a photo stop with no caption.
  captionI18n?: Partial<Record<Locale, PhotoTranslation>>;
  postTitle?: string | null;
  postTitleI18n?: Partial<Record<Locale, PostTranslation>>;
};

export function JourneyExplorer({
  title: rawTitle,
  backHref,
  backLabel: rawBackLabel,
  titleI18n,
  stops: rawStops,
  tracks,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  titleI18n?: Partial<Record<Locale, TripTranslation>>;
  stops: JourneyStop[];
  tracks: Track[];
}) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState<JourneyStop | null>(null);

  // Localize the trip title and each stop's caption/label to the reader's
  // language on the client; both languages ship raw in the static payload.
  const title = titleI18n?.[locale]?.title ?? rawTitle;
  const backLabel = titleI18n?.[locale]?.title ?? rawBackLabel;
  const stops = useMemo(
    () =>
      rawStops.map((s) => {
        if (s.type !== "photo") return s;
        const caption = s.captionI18n?.[locale]?.caption ?? s.caption ?? null;
        const postTitle =
          s.postTitleI18n?.[locale]?.title ?? s.postTitle ?? null;
        return { ...s, caption, name: caption ?? postTitle ?? s.name };
      }),
    [rawStops, locale],
  );

  // Order the stops along the route so "next" walks the journey in sequence:
  // author order → chronological → nearest-track-vertex (see orderJourneyStops).
  const ordered = useMemo(() => orderJourneyStops(stops, tracks), [stops, tracks]);

  // The dashed connector bridges the gaps between the recorded GPX tracks — it
  // never retraces a track. On the trip map photos are pins, not waypoints, so
  // we don't weave them into the route: that keeps a photo with a stray or
  // wrong timestamp (e.g. shot the day before its post) from being mis-slotted
  // into the line. When there are no tracks, fall back to a single dashed line
  // through the stops in the chosen gallery order.
  const connectorSegments = useMemo(() => {
    const trackInput = tracks.map((tr) => ({
      startedAt: tr.started_at,
      endedAt: tr.ended_at,
      coords: (tr.geojson?.features ?? []).flatMap(
        (f) => f.geometry?.coordinates ?? [],
      ),
    }));
    const segs = buildConnectorSegments(trackInput, []);
    if (segs.length === 0 && ordered.length > 1)
      return [ordered.map((s) => [s.lng, s.lat])];
    return segs;
  }, [tracks, ordered]);

  // Build the map once.
  useEffect(() => {
    if (!container.current || ordered.length === 0) return;

    // Frame the camera on the whole journey from the first frame, so a slow
    // connection only fetches the tiles we end up showing — not a wide zoom-12
    // view first and then a fit.
    const initialBounds = (() => {
      const b = new maplibregl.LngLatBounds();
      let any = false;
      const add = (lng: number, lat: number) => {
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          b.extend([lng, lat]);
          any = true;
        }
      };
      ordered.forEach((s) => add(s.lng, s.lat));
      for (const t of tracks)
        for (const f of t.geojson?.features ?? [])
          for (const c of f.geometry?.coordinates ?? []) add(c[0], c[1]);
      return any ? b : null;
    })();
    // Snug fit clearing the back button (top) and the stepper card (bottom).
    const fitOpts = {
      padding: { top: 64, bottom: 196, left: 32, right: 32 },
      maxZoom: 15,
    };
    const view = initialView(initialBounds, 15);

    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      center: view ? view.center : [ordered[0].lng, ordered[0].lat],
      zoom: view ? view.zoom : 12,
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

      // One source for all of this journey's stages (see map-tracks); its
      // routes aren't clickable, so no handlers either.
      addTracksLayer(map, tracks, { fallbackName: "", width: 4, opacity: 0.9 });

      // Dashed orange line bridging only the gaps the solid tracks leave
      // (overnight hops, transfers between recorded segments) — one feature per
      // gap, so it never retraces a track or links mid-track photos.
      if (connectorSegments.length > 0) {
        map.addSource("journey-connector", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: connectorSegments.map((coordinates) => ({
              type: "Feature" as const,
              properties: {},
              geometry: { type: "LineString" as const, coordinates },
            })),
          },
        });
        map.addLayer({
          id: "journey-connector",
          type: "line",
          source: "journey-connector",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffb454",
            "line-width": 2.5,
            "line-opacity": 0.95,
            "line-dasharray": [2, 1.8],
          },
        });
      }

      // Smaller markers keep dense stretches (many photos close together) from
      // overlapping and spilling past the map edges.
      ordered.forEach((s, i) => {
        const el = document.createElement("button");
        el.setAttribute("aria-label", s.name);
        if (s.type === "photo" && s.photoUrl) {
          el.style.cssText =
            "width:30px;height:30px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 7px rgba(0,0,0,.45);cursor:pointer";
          // Paint the blurhash instantly, then swap in the real thumbnail once
          // it has loaded — no black dot while the image downloads.
          const placeholder = blurhashToDataURL(s.blurhash, 24, 24);
          const real = optimizedSrc(s.photoUrl, 96, 70);
          el.style.backgroundImage = `url(${placeholder ?? real})`;
          if (placeholder) {
            const pre = new Image();
            pre.onload = () => {
              el.style.backgroundImage = `url(${real})`;
            };
            pre.src = real;
          }
        } else {
          el.className =
            "grid place-items-center size-6 rounded-full bg-[#f56a1f] text-[#0a0908] text-[10px] font-bold ring-2 ring-white/80 shadow cursor-pointer";
          el.textContent = String(i + 1);
        }
        el.onclick = () => setIndex(i);
        new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      });

      // Re-fit after the full-screen container settles its size (it can size
      // after mount). Same bounds as the constructor, so it's a no-op unless the
      // box sized late — then it corrects the framing.
      if (initialBounds) map.fitBounds(initialBounds, { ...fitOpts, duration: 0 });
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
      if (lightbox) return; // the lightbox handles its own keys
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
          <div className="glass w-full rounded-2xl p-4 sm:w-96">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-ember-300">
              <span className="truncate">{title}</span>
              <span className="shrink-0 text-ember-300/70">
                · {index + 1} / {ordered.length}
              </span>
            </p>

            <div className="mt-2 flex items-center gap-3">
              {current.type === "photo" && current.photoUrl ? (
                <button
                  onClick={() => setLightbox(current)}
                  className="relative size-16 shrink-0 overflow-hidden rounded-xl"
                  aria-label={t("journey.openPhoto")}
                >
                  <BlurImg
                    src={optimizedSrc(current.photoUrl, 256, 70)}
                    blurhash={current.blurhash}
                    alt={current.caption ?? ""}
                  />
                </button>
              ) : (
                <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-ember-500/15 text-ember-400">
                  <MapPin className="size-6" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 font-display text-lg font-semibold">
                  {current.type === "photo" && (
                    <Camera className="size-4 shrink-0 text-ember-400" />
                  )}
                  <span className="truncate">{current.name}</span>
                </p>
                {(current.href ||
                  (current.type === "photo" && current.photoUrl)) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    {current.type === "photo" && current.photoUrl && (
                      <button
                        onClick={() => setLightbox(current)}
                        className="text-ember-400 hover:underline"
                      >
                        {t("journey.openPhoto")}
                      </button>
                    )}
                    {current.href && (
                      <Link
                        href={current.href}
                        className="text-sand-100/60 hover:underline"
                      >
                        {t("journey.viewStory")}
                      </Link>
                    )}
                  </div>
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
              {ordered.length > 12 ? (
                // Too many stops for dots — a tap-to-seek progress bar instead.
                <button
                  type="button"
                  aria-label={t("journey.scrub")}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const f = (e.clientX - r.left) / r.width;
                    setIndex(
                      Math.min(
                        ordered.length - 1,
                        Math.max(0, Math.round(f * (ordered.length - 1))),
                      ),
                    );
                  }}
                  className="relative h-1.5 w-28 overflow-hidden rounded-full bg-white/20"
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-ember-400 transition-[width]"
                    style={{ width: `${((index + 1) / ordered.length) * 100}%` }}
                  />
                </button>
              ) : (
                <div className="flex gap-1">
                  {ordered.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => setIndex(i)}
                      aria-label={t("journey.goToStop", { n: i + 1 })}
                      className={`size-1.5 rounded-full transition ${
                        i === index
                          ? "bg-ember-400"
                          : "bg-white/25 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              )}
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

      {/* Shared full-screen viewer (rotation + progressive load). */}
      <ImageLightbox
        open={!!lightbox}
        src={lightbox?.photoUrl ?? null}
        blurhash={lightbox?.blurhash}
        alt={lightbox?.caption ?? ""}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
