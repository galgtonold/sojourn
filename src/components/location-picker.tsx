"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { env } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

type PickerTrack = {
  id: string;
  geojson?: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
};

/**
 * A small map for picking a post's location: click anywhere (or drag the pin) to
 * set the coordinates. Stays in two-way sync with the lat/lng text inputs, so it
 * also reflects coordinates typed in or auto-filled from a photo's EXIF.
 */
export function LocationPicker({
  open,
  lat,
  lng,
  onChange,
  className,
  postId,
}: {
  // Whether the picker is currently visible. It stays mounted while hidden, so
  // this is what tells the map to resize and re-frame on each open.
  open: boolean;
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  className?: string;
  // The post whose route geometry to draw for context; the map frames to it on
  // every open. Omit to get a bare map with no routes.
  postId?: string;
}) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const loadedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  // Hold the map hidden until it has settled and fade it in. The container has
  // no background of its own, so MapLibre paints the style's LIGHT background
  // layer before tiles arrive — a light flash on the dark dialog on every open.
  const [ready, setReady] = useState(false);

  // The geometry is only needed once the picker is actually visible, and it is
  // large (~83KB of GPX JSON on a long post). Fetching it here rather than
  // taking it as a prop keeps it out of the editor page's RSC payload, which
  // every load pays for even though most sessions never open this dialog.
  const [tracks, setTracks] = useState<PickerTrack[]>([]);
  // Latched rather than keyed off `tracks.length`, so a post with no tracks —
  // where the gallery opens this once per photo — doesn't re-query on every open
  // to be told "none" again.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!open || !postId || fetchedRef.current) return;
    // Latched, no `cancelled` guard: LocationDialog keeps this component mounted
    // and hidden via CSS (`locEverOpened` in photo-manager.tsx), so it only ever
    // unmounts on navigation — this effect's cleanup instead runs on every
    // open/close flip. A cancel flag set there would discard the in-flight
    // result while leaving the latch set, permanently starving `tracks` with no
    // retry path. React 18+ also dropped the setState-after-unmount warning, so
    // there's nothing left for the guard to protect against.
    fetchedRef.current = true;
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data, error } = await supabase
          .from("tracks")
          .select("id, geojson")
          .eq("post_id", postId)
          .order("created_at", { ascending: true });
        // PostgREST failures (RLS denial, network) resolve rather than throw,
        // so a dropped `error` here would look identical to "no tracks" —
        // surface it the same way track-manager.tsx does for this table.
        if (error) throw new Error(error.message);
        if (data?.length) setTracks(data as PickerTrack[]);
      } catch (e) {
        // No routes drawn is a degraded map, not a broken one — the pin, the
        // click-to-place and the lat/lng inputs all still work.
        console.error("[picker] track geometry failed:", e);
      }
    })();
  }, [open, postId]);

  const nLat = Number(lat);
  const nLng = Number(lng);
  const hasCoords =
    lat !== "" && lng !== "" && Number.isFinite(nLat) && Number.isFinite(nLng);

  // The map is built once and outlives many opens, so `frame` below can't close
  // over the current values — it would keep the first open's forever. Mirror them
  // into refs during render instead, the same way `onChange` is handled above.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const coordsRef = useRef({ hasCoords, nLat, nLng });
  coordsRef.current = { hasCoords, nLat, nLng };

  // Add the post's tracks to the map (idempotent — `getSource` short-circuits the
  // reveals after the first) and report the bounds they span, or null when the
  // post has no usable geometry.
  const drawTracks = useCallback((map: maplibregl.Map) => {
    const list = (tracksRef.current ?? []).filter((tk) => tk.geojson);
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    list.forEach((tk, i) => {
      const sourceId = `pick-track-${tk.id ?? i}`;
      if (!map.getSource(sourceId)) {
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
      }
      for (const f of tk.geojson?.features ?? []) {
        for (const c of f.geometry?.coordinates ?? []) {
          bounds.extend([c[0], c[1]]);
          any = true;
        }
      }
    });
    return any ? bounds : null;
  }, []);

  // The single framing rule, shared by the first load and every later reveal, so
  // a photo lands the same way whichever one it is. With a route, fill the map
  // with it (plus the pin) — the author places the photo relative to where they
  // actually walked, which is the whole point of the picker.
  const frame = useCallback(
    (map: maplibregl.Map) => {
      const { hasCoords: has, nLat: la, nLng: ln } = coordsRef.current;
      const bounds = drawTracks(map);
      if (bounds) {
        if (has) bounds.extend([ln, la]);
        map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
        return;
      }
      if (has) {
        map.jumpTo({ center: [ln, la], zoom: 9 });
        return;
      }
      // No pin and no route: deliberately KEEP the current view rather than
      // resetting to the world. Tagging a trip's photos in sequence, staying in
      // the region is the point.
    },
    [drawTracks],
  );

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
    // Ignore the 0×0 entry the dialog's `display:none` fires on every close:
    // resizing the transform to zero is a MapLibre path with a history of NaN /
    // Invalid LngLat edge cases, and nothing needs it. The reveal effect below
    // resizes explicitly, and both calls are idempotent.
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width && e.contentRect.height) map.resize();
    });
    ro.observe(container.current);

    map.on("click", (e) => {
      onChangeRef.current(e.lngLat.lat.toFixed(6), e.lngLat.lng.toFixed(6));
    });

    // Nothing may touch sources or the camera before the style is up. The reveal
    // effect below defers to this on the first open; afterwards it frames itself.
    map.on("load", () => {
      loadedRef.current = true;
      frame(map);
    });

    // Reveal once the first frame is fully rendered (tiles + framing settled).
    // Registered on the map rather than nested inside `load` so that no early
    // return added in there can strand the picker on the 2s net.
    map.once("idle", () => setReady(true));

    // Safety net: never leave the map hidden if `idle` is slow to fire.
    const reveal = setTimeout(() => setReady(true), 2000);

    return () => {
      clearTimeout(reveal);
      ro.disconnect();
      loadedRef.current = false;
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Framing must not live in map.on("load") alone — that fires once per instance,
  // so a reused map would never move to the next photo. Re-run it here whenever
  // the dialog becomes visible.
  //
  // useLayoutEffect, not useEffect: the container is 0×0 under the dialog's
  // `display:none`, so the canvas has to be resized before the browser paints the
  // reveal or the first frame is stretched or blank. (Client-only component —
  // "use client" and next/dynamic'd with ssr:false — so the SSR warning can't fire.)
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map || !open) return;
    map.resize();
    // Before the style is up there is nothing to frame; the `load` handler above
    // calls the same `frame`, so the first open lands exactly where a reopen does.
    if (loadedRef.current) frame(map);
    // Coordinates and tracks are read (via refs, inside `frame`) on the open
    // transition only, not tracked as deps: coordinates also change when the user
    // clicks the map, drags the pin or types into the lat/lng inputs, and
    // re-framing on those would yank the camera out from under the cursor. The
    // dialog syncs the draft during render, so they are already this photo's by
    // the time this runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The geometry now arrives asynchronously, so it can land after `load` has
  // already framed a map with no routes on it. Draw and re-frame when it does.
  // Not a duplicate of the two calls above: whichever of the three runs last
  // wins, and `frame` → `drawTracks` is idempotent (`getSource` short-circuits
  // the re-adds, and framing is a jump to the same computed bounds).
  //
  // Deliberately doesn't check `open`: geometry can land while the dialog is
  // hidden (fetch outlives a close), so `frame` may call `fitBounds` on a
  // display:none map. That's only safe because the ResizeObserver above
  // ignores the 0×0 entry the hidden container reports — `map.transform` keeps
  // its last non-zero size, so `fitBounds` computes against a real viewport
  // instead of MapLibre's negative-padding path for a zero-size one. If that
  // guard ever changes, this call needs an `open` check added alongside it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !tracks.length) return;
    frame(map);
  }, [tracks, frame]);

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

  // The map element itself is left untouched (opacity/transform on it breaks
  // MapLibre's canvas positioning). Instead a sibling overlay covers it during
  // load and fades out — hiding the light-background flash before tiles land.
  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={container} className="h-full w-full" />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-xl bg-ink-900 transition-opacity duration-300 ${ready ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
}
