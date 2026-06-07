"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { optimizedSrc } from "@/lib/utils";
import { useT } from "@/components/i18n";
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
  clusterPhotos = false,
  className = "h-[420px]",
}: {
  markers?: MapMarker[];
  tracks?: Track[];
  photos?: PhotoPin[];
  route?: boolean;
  // Render photos as a clustered GeoJSON layer instead of one DOM marker each.
  // Essential at global scale (the /photos map) where there may be hundreds.
  clusterPhotos?: boolean;
  className?: string;
}) {
  const t = useT();
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

      // Photo pins — either a clustered GeoJSON layer (global photo map) or one
      // thumbnail DOM marker each (per-trip maps, where counts are small).
      const photoPopupHtml = (p: {
        url: string;
        caption?: string | null;
        href?: string | null;
      }) =>
        `<a ${p.href ? `href="${p.href}"` : ""} style="display:block;width:200px;text-decoration:none;color:#faf6f0">
          <img src="${optimizedSrc(p.url, 400, 70)}" style="width:100%;height:auto;border-radius:8px;display:block" alt="" />
          ${p.caption ? `<div style="padding:6px 2px 0;font-size:12px;line-height:1.3">${esc(p.caption)}</div>` : ""}
          ${p.href ? `<div style="padding:6px 2px 0;font-size:11px;color:#ff8f4d">${esc(t("map.openStory"))}</div>` : ""}
        </a>`;

      if (clusterPhotos && photos.length) {
        photos.forEach((p) => extend(p.lng, p.lat));
        map.addSource("photos", {
          type: "geojson",
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 14,
          data: {
            type: "FeatureCollection",
            features: photos.map((p) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
              properties: {
                url: p.url,
                caption: p.caption ?? "",
                href: p.href ?? "",
              },
            })),
          },
        });
        map.addLayer({
          id: "photo-clusters",
          type: "circle",
          source: "photos",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#f56a1f",
            "circle-opacity": 0.92,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 30],
          },
        });
        map.addLayer({
          id: "photo-cluster-count",
          type: "symbol",
          source: "photos",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
          },
          paint: { "text-color": "#0a0908" },
        });
        map.addLayer({
          id: "photo-point",
          type: "circle",
          source: "photos",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#f56a1f",
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });

        map.on("click", "photo-clusters", (e) => {
          const feature = map.queryRenderedFeatures(e.point, {
            layers: ["photo-clusters"],
          })[0];
          const clusterId = feature?.properties?.cluster_id;
          if (clusterId == null) return;
          const src = map.getSource("photos") as maplibregl.GeoJSONSource;
          src.getClusterExpansionZoom(clusterId).then((zoom) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const coords = (feature.geometry as any).coordinates;
            map.easeTo({ center: coords, zoom });
          });
        });
        map.on("click", "photo-point", (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const coords = (feature.geometry as any).coordinates.slice();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const props = feature.properties as any;
          new maplibregl.Popup({ offset: 14, maxWidth: "220px" })
            .setLngLat(coords)
            .setHTML(
              photoPopupHtml({
                url: props.url,
                caption: props.caption || null,
                href: props.href || null,
              }),
            )
            .addTo(map);
        });
        for (const layer of ["photo-clusters", "photo-point"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      } else {
        photos.forEach((p) => {
          extend(p.lng, p.lat);
          const el = document.createElement("button");
          el.style.cssText =
            "width:36px;height:36px;border-radius:9999px;background-size:cover;background-position:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer";
          el.style.backgroundImage = `url(${optimizedSrc(p.url, 128, 70)})`;
          new maplibregl.Marker({ element: el })
            .setLngLat([p.lng, p.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 20, maxWidth: "220px" }).setHTML(
                photoPopupHtml(p),
              ),
            )
            .addTo(map);
        });
      }

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
