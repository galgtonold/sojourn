"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import type { Track } from "@/lib/types";

export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href?: string;
};

export type PhotoPin = {
  id: string;
  lat: number;
  lng: number;
  url: string;
  caption?: string | null;
  href?: string;
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/**
 * Map of a journey: GPX routes, numbered waypoints (optionally joined by a
 * dashed line), and clickable photo pins that pop open the image.
 */
export function TripMap({
  markers = [],
  tracks = [],
  photos = [],
  route = true,
  className = "h-[420px]",
}: {
  markers?: MapMarker[];
  tracks?: Track[];
  photos?: PhotoPin[];
  route?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  const hasContent = markers.length > 0 || tracks.length > 0 || photos.length > 0;

  useEffect(() => {
    if (!container.current || !hasContent) return;

    const first =
      markers[0] ??
      (photos[0] ? { lng: photos[0].lng, lat: photos[0].lat } : null) ??
      firstTrackPoint(tracks);

    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      center: first ? [first.lng, first.lat] : [0, 20],
      zoom: 5,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    map.on("load", () => {
      map.resize();
      const bounds = new maplibregl.LngLatBounds();
      const extend = (lng: number, lat: number) => bounds.extend([lng, lat]);

      // GPX tracks
      tracks.forEach((t, i) => {
        const sourceId = `track-${t.id ?? i}`;
        map.addSource(sourceId, { type: "geojson", data: t.geojson });
        map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#f56a1f", "line-width": 4, "line-opacity": 0.9 },
        });
        for (const f of t.geojson?.features ?? []) {
          for (const c of f.geometry?.coordinates ?? []) extend(c[0], c[1]);
        }
      });

      // Waypoint connector (only when we have no GPX and route is requested)
      if (route && tracks.length === 0 && markers.length > 1) {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: markers.map((m) => [m.lng, m.lat]),
            },
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#f56a1f",
            "line-width": 3,
            "line-dasharray": [1, 1.6],
            "line-opacity": 0.85,
          },
        });
      }

      // Waypoints
      markers.forEach((m, i) => {
        extend(m.lng, m.lat);
        const el = document.createElement("button");
        el.className =
          "grid place-items-center size-7 rounded-full bg-[#f56a1f] text-[#0a0908] text-xs font-bold ring-2 ring-white/80 shadow-lg cursor-pointer";
        el.textContent = String(i + 1);
        if (m.href) el.onclick = () => (window.location.href = m.href!);
        new maplibregl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setText(m.name))
          .addTo(map);
      });

      // Photo pins
      photos.forEach((p) => {
        extend(p.lng, p.lat);
        const el = document.createElement("button");
        el.style.cssText =
          "width:36px;height:36px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer";
        el.style.backgroundImage = `url(${optimizedSrc(p.url, 128, 70)})`;
        const html = `<a ${p.href ? `href="${p.href}"` : ""} style="display:block;width:200px;text-decoration:none;color:#faf6f0">
          <img src="${optimizedSrc(p.url, 400, 70)}" style="width:100%;height:auto;border-radius:8px;display:block" alt="" />
          ${p.caption ? `<div style="padding:6px 2px 0;font-size:12px;line-height:1.3">${esc(p.caption)}</div>` : ""}
          ${p.href ? `<div style="padding:6px 2px 0;font-size:11px;color:#ff8f4d">Open story →</div>` : ""}
        </a>`;
        new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 20, maxWidth: "220px" }).setHTML(html))
          .addTo(map);
      });

      if (!bounds.isEmpty()) {
        const single =
          markers.length + photos.length <= 1 && tracks.length === 0;
        map.fitBounds(bounds, {
          padding: 64,
          maxZoom: single ? 9 : 14,
          duration: 0,
        });
      }
    });

    return () => {
      ro.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasContent) return null;

  return (
    <div
      ref={container}
      className={`w-full overflow-hidden rounded-3xl ring-1 ring-white/10 ${className}`}
    />
  );
}

function firstTrackPoint(tracks: Track[]): { lng: number; lat: number } | null {
  for (const t of tracks) {
    const c = t.geojson?.features?.[0]?.geometry?.coordinates?.[0];
    if (c) return { lng: c[0], lat: c[1] };
  }
  return null;
}
