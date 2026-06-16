"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import type { Block } from "@/lib/rich";
import type { Track } from "@/lib/types";
import {
  type MapMarker,
  type PhotoPin,
  orderPhotosByTime,
  photoConnectors,
} from "@/components/trip-map";
import { Figure, mdComponents } from "@/components/prose";
import { InteractiveBlock } from "@/components/interactive-block";

const DESKTOP = "(min-width: 1024px)";

/**
 * Desktop scrollytelling: a two-column layout where the narrative scrolls on
 * the left while a sticky map on the right flies to each geotagged photo as its
 * passage crosses the middle of the screen. Below the lg breakpoint the map
 * column is dropped entirely — the post renders a normal inline map instead —
 * so phones keep the full width for reading.
 */
export function StoryMap({
  excerpt,
  blocks,
  tracks,
  markers,
  photoPins,
}: {
  excerpt: string | null;
  blocks: Block[];
  tracks: Track[];
  markers: MapMarker[];
  photoPins: PhotoPin[];
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const narrative = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [active, setActive] = useState<[number, number] | null>(null);

  // Track the breakpoint so the map only ever builds while its column is shown.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Build the sticky map (desktop only).
  useEffect(() => {
    if (!isDesktop || !mapContainer.current) return;
    setMapReady(false);

    const ordered = orderPhotosByTime(photoPins);
    const start = ordered[0] ?? markers[0] ?? { lng: 0, lat: 20 };
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: env.mapStyleUrl,
      center: [start.lng, start.lat],
      zoom: 6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainer.current);

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

      markers.forEach((m, i) => {
        bounds.extend([m.lng, m.lat]);
        const el = document.createElement("div");
        el.className =
          "grid place-items-center size-6 rounded-full bg-[#f56a1f] text-[#0a0908] text-[11px] font-bold ring-2 ring-white/80 shadow";
        el.textContent = String(i + 1);
        new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map);
      });

      // Bridge photos to the track across the gaps it doesn't cover (before it
      // started / after it ended); photos taken during it stay unconnected.
      const connectors = photoConnectors(photoPins, tracks);
      if (connectors.length) {
        map.addSource("photo-path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "MultiLineString", coordinates: connectors },
          },
        });
        map.addLayer({
          id: "photo-path",
          type: "line",
          source: "photo-path",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#f56a1f",
            "line-width": 2.5,
            "line-dasharray": [1.5, 1.5],
            "line-opacity": 0.6,
          },
        });
      }
      ordered.forEach((p, i) => {
        bounds.extend([p.lng, p.lat]);
        const el = document.createElement("div");
        el.style.cssText =
          "position:absolute;width:34px;height:34px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)";
        el.style.backgroundImage = `url(${optimizedSrc(p.url, 96, 70)})`;
        const badge = document.createElement("span");
        badge.textContent = String(i + 1);
        badge.style.cssText =
          "position:absolute;top:-6px;left:-6px;display:grid;place-items:center;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;background:#f56a1f;color:#0a0908;font:700 10px/1 ui-sans-serif,system-ui,sans-serif;border:2px solid #0a0908;box-shadow:0 1px 3px rgba(0,0,0,.5)";
        el.appendChild(badge);
        new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      });

      boundsRef.current = bounds;
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 0 });
      }
      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  // Fly to the active photo as the story scrolls.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (active) {
      map.flyTo({ center: active, zoom: 16.5, speed: 0.7, essential: true });
    } else if (boundsRef.current && !boundsRef.current.isEmpty()) {
      map.fitBounds(boundsRef.current, { padding: 56, maxZoom: 16, duration: 1000 });
    }
  }, [active, mapReady]);

  // Activate whichever photo passage is crossing the middle of the viewport.
  useEffect(() => {
    if (!isDesktop) return;
    const root = narrative.current;
    if (!root) return;
    const anchors = root.querySelectorAll<HTMLElement>("[data-story-anchor]");
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const t = (e.target as HTMLElement).dataset.target;
          setActive(
            !t || t === "overview"
              ? null
              : (t.split(",").map(Number) as [number, number]),
          );
          break;
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    anchors.forEach((a) => obs.observe(a));
    return () => obs.disconnect();
  }, [isDesktop]);

  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10 xl:gap-14">
        {/* Narrative — single column on mobile, left column on desktop. */}
        <div
          ref={narrative}
          className="mx-auto max-w-2xl space-y-10 py-8 lg:mx-0 lg:max-w-none lg:py-14"
        >
          <div data-story-anchor data-target="overview">
            {excerpt && (
              <p className="font-display text-xl leading-relaxed text-sand-100/90">
                {excerpt}
              </p>
            )}
          </div>

          {blocks.map((b, i) => {
            if (b.kind === "interaction") {
              return <InteractiveBlock key={i} interaction={b.interaction} />;
            }
            if (b.kind === "photo") {
              const geo = b.photo.lat != null && b.photo.lng != null;
              return (
                <div
                  key={i}
                  {...(geo
                    ? {
                        "data-story-anchor": true,
                        "data-target": `${b.photo.lng},${b.photo.lat}`,
                      }
                    : {})}
                >
                  <Figure
                    id={`photo-${b.photo.id}`}
                    src={b.photo.url ?? ""}
                    alt={b.photo.alt ?? undefined}
                    caption={b.photo.caption}
                    blurhash={b.photo.blurhash}
                  />
                </div>
              );
            }
            if (b.kind !== "md") return null;
            return (
              <div
                key={i}
                className="text-lg text-sand-100/80 [&>*+*]:mt-5 [&>*+h2]:mt-10 [&>*+h3]:mt-8 [&>*+figure]:mt-8"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {b.text}
                </ReactMarkdown>
              </div>
            );
          })}
        </div>

        {/* Sticky map column — desktop only. */}
        <div className="hidden lg:block">
          <div className="sticky top-24 h-[calc(100vh-7rem)]">
            <div
              ref={mapContainer}
              className="size-full overflow-hidden rounded-3xl bg-ink-900 shadow-xl ring-1 ring-white/10"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
