"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { useT } from "@/components/i18n";

/**
 * A small map for picking a post's location: click anywhere (or drag the pin) to
 * set the coordinates. Stays in two-way sync with the lat/lng text inputs, so it
 * also reflects coordinates typed in or auto-filled from a photo's EXIF.
 */
export function LocationPicker({
  lat,
  lng,
  onChange,
  className,
  tracks,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  className?: string;
  // Optional route geometry to draw for context; the map fits to it on load.
  tracks?: { id: string; geojson?: GeoJSON.FeatureCollection<GeoJSON.LineString> | null }[];
}) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [failed, setFailed] = useState(false);

  const nLat = Number(lat);
  const nLng = Number(lng);
  const hasCoords =
    lat !== "" && lng !== "" && Number.isFinite(nLat) && Number.isFinite(nLng);

  // Build the map once; a click sets the coordinates.
  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: env.mapStyleUrl,
        center: hasCoords ? [nLng, nLat] : [10, 30],
        zoom: hasCoords ? 9 : 1.3,
        attributionControl: { compact: true },
      });
    } catch {
      // Tile/WebGL/network failure: fall back to the coordinate inputs.
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    map.on("click", (e) => {
      onChangeRef.current(e.lngLat.lat.toFixed(6), e.lngLat.lng.toFixed(6));
    });

    // Draw the post's tracks for context and frame the map to fill with them
    // (plus the current pin), so the author places the photo relative to the
    // recorded route. Only the initial fit — later pin drags don't re-frame.
    map.on("load", () => {
      const list = (tracks ?? []).filter((tk) => tk.geojson);
      if (!list.length) return; // no tracks → keep the constructor's framing
      const bounds = new maplibregl.LngLatBounds();
      let any = false;
      list.forEach((tk, i) => {
        const sourceId = `pick-track-${tk.id ?? i}`;
        if (map.getSource(sourceId)) return;
        map.addSource(sourceId, {
          type: "geojson",
          data: tk.geojson as GeoJSON.FeatureCollection,
        });
        map.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#f56a1f", "line-width": 3, "line-opacity": 0.85 },
        });
        for (const f of tk.geojson?.features ?? []) {
          for (const c of f.geometry?.coordinates ?? []) {
            bounds.extend([c[0], c[1]]);
            any = true;
          }
        }
      });
      if (hasCoords) {
        bounds.extend([nLng, nLat]);
        any = true;
      }
      if (any) map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
    });

    return () => {
      ro.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect the current coordinates as a draggable pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hasCoords) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const ll: [number, number] = [nLng, nLat];
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:22px;height:22px;border-radius:9999px;background:#f56a1f;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:grab";
      const m = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(ll)
        .addTo(map);
      m.on("dragend", () => {
        const p = m.getLngLat();
        onChangeRef.current(p.lat.toFixed(6), p.lng.toFixed(6));
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLngLat(ll);
    }
  }, [nLat, nLng, hasCoords]);

  if (failed) {
    return (
      <div
        className={`grid place-items-center bg-ink-800 p-4 text-center text-sm text-sand-100/60 ${className ?? ""}`}
      >
        {t("admin.editor.mapError")}
      </div>
    );
  }

  return <div ref={container} className={className} />;
}
