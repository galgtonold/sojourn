"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";

export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href?: string;
};

/**
 * Interactive map of trip/post locations. Draws numbered pins and, when there
 * are 2+ points, a route line connecting them in order.
 */
export function TripMap({
  markers,
  route = true,
  className = "h-[420px]",
}: {
  markers: MapMarker[];
  route?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!container.current || markers.length === 0) return;

    const map = new maplibregl.Map({
      container: container.current,
      style: env.mapStyleUrl,
      center: [markers[0].lng, markers[0].lat],
      zoom: 5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();

      markers.forEach((m, i) => {
        bounds.extend([m.lng, m.lat]);

        const el = document.createElement("button");
        el.className =
          "grid place-items-center size-7 rounded-full bg-[#f56a1f] text-[#0a0908] text-xs font-bold ring-2 ring-white/80 shadow-lg cursor-pointer";
        el.textContent = String(i + 1);
        if (m.href) el.onclick = () => (window.location.href = m.href!);

        const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setText(
          m.name,
        );

        new maplibregl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .setPopup(popup)
          .addTo(map);
      });

      if (route && markers.length > 1) {
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
            "line-opacity": 0.9,
          },
        });
      }

      if (markers.length > 1) {
        map.fitBounds(bounds, { padding: 64, maxZoom: 9, duration: 0 });
      } else {
        map.setZoom(8);
      }
    });

    return () => map.remove();
  }, [markers, route]);

  if (markers.length === 0) return null;

  return (
    <div
      ref={container}
      className={`w-full overflow-hidden rounded-3xl ring-1 ring-white/10 ${className}`}
    />
  );
}
