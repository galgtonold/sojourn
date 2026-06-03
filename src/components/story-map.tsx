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
import type { MapMarker, PhotoPin } from "@/components/trip-map";
import { Figure, mdComponents } from "@/components/prose";
import { InteractiveBlock } from "@/components/interactive-block";

/**
 * Scrollytelling: a sticky map (desktop) that flies to each geotagged photo as
 * it scrolls into the centre of the article. On mobile it renders as a normal
 * interleaved article (the sticky map is hidden).
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
  const [mapReady, setMapReady] = useState(false);
  const [active, setActive] = useState<[number, number] | null>(null);

  // Build the map (desktop only — the column is hidden on small screens).
  useEffect(() => {
    if (!mapContainer.current) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    const start =
      photoPins[0] ?? markers[0] ?? { lng: 0, lat: 20 };
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

      photoPins.forEach((p) => {
        bounds.extend([p.lng, p.lat]);
        const el = document.createElement("div");
        el.style.cssText =
          "width:30px;height:30px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)";
        el.style.backgroundImage = `url(${optimizedSrc(p.url, 96, 70)})`;
        new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      });

      boundsRef.current = bounds;
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 0 });
      }
      setMapReady(true);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly the map as the active step changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (active) {
      map.flyTo({ center: active, zoom: 14.5, speed: 0.7, essential: true });
    } else if (boundsRef.current && !boundsRef.current.isEmpty()) {
      map.fitBounds(boundsRef.current, { padding: 70, maxZoom: 13, duration: 1000 });
    }
  }, [active, mapReady]);

  // Observe anchor steps and set the active location as they reach the centre.
  useEffect(() => {
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
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_1.05fr] lg:gap-12">
      {/* Sticky map (desktop) */}
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen w-full py-6">
          <div
            ref={mapContainer}
            className="size-full overflow-hidden rounded-3xl ring-1 ring-white/10"
          />
        </div>
      </div>

      {/* Narrative */}
      <div
        ref={narrative}
        className="mx-auto max-w-2xl space-y-10 px-6 py-[12vh] lg:py-[42vh]"
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
                  src={b.photo.url ?? ""}
                  alt={b.photo.alt ?? undefined}
                  caption={b.photo.caption}
                />
              </div>
            );
          }
          return (
            <div key={i} className="space-y-5 text-lg text-sand-100/80">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {b.text}
              </ReactMarkdown>
            </div>
          );
        })}
      </div>
    </div>
  );
}
