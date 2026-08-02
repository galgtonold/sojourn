"use client";
import { useEffect, useState } from "react";
import { optimizedSrc } from "@/lib/utils";
import { shouldRotatePhoto } from "@/lib/photo-rotation";

export type ViewerItem = {
  url: string;
  alt?: string;
  caption?: string | null;
  blurhash?: string | null;
  mediaType?: "image" | "video" | null;
  posterUrl?: string | null;
};

/**
 * One photo in the viewer's track, with its caption.
 *
 * The photo and its caption form a single unit that turns together (see
 * @/lib/photo-rotation for why it is only ever these two). Rotating the photo
 * and leaving its caption upright leaves the two reading at right angles; as one
 * unit the caption stays on the photo's bottom edge either way, and travels with
 * it as the slide is dragged.
 *
 * The unit shrink-wraps the photo — `max-h/max-w` on the image rather than a
 * fixed box with `object-contain` — so the caption anchored to its bottom edge
 * sits ON the photo at any aspect ratio, instead of floating in the letterbox
 * beside it. The hi-res overlay gets the same rect for free.
 *
 * Rotation is decided per photo, and the measured ratio is reported UP so the
 * viewer can remember it per URL: a neighbour is measured while off-screen, so
 * it arrives already facing the right way rather than snapping once centred.
 */
export function PhotoSlide({
  item,
  active,
  portrait,
  wantHiRes,
  ratio,
  onRatio,
}: {
  item: ViewerItem;
  /** The centred slide. Only it pays for the hi-res tier and video autoplay. */
  active: boolean;
  portrait: boolean;
  wantHiRes: boolean;
  /** Natural width/height if this photo has ever been measured, else 0. */
  ratio: number;
  onRatio: (url: string, ratio: number) => void;
}) {
  const [hiRes, setHiRes] = useState(false);
  const isVideo = item.mediaType === "video";

  // A slot showing a different photo must re-run its hi-res crossfade from
  // transparent, or the new photo inherits the old one's finished fade.
  useEffect(() => setHiRes(false), [item.url]);

  const rotated = shouldRotatePhoto({ portrait, ratio });
  // Turned, the photo is measured against the viewport with its axes swapped:
  // its width is bounded by the screen's HEIGHT and vice versa.
  const fitCls = rotated
    ? "max-h-[95vw] max-w-[92dvh]"
    : "max-h-[96dvh] max-w-[96vw]";
  // The caption clears the prev/next buttons. Upright they never meet, but
  // turned, the photo's bottom edge runs down the screen's LEFT edge — straight
  // through the previous button — so it is pushed in far enough to miss it.
  const captionPad = rotated ? "pb-[4.5rem]" : "pb-3 sm:pb-5";

  if (isVideo) {
    return (
      <video
        src={item.url}
        poster={item.posterUrl ?? undefined}
        controls
        playsInline
        autoPlay={active}
        className="max-h-[92dvh] w-auto max-w-[96vw] rounded-2xl"
      />
    );
  }

  return (
    // `shrink-0` is load-bearing: turned, the unit is deliberately WIDER than the
    // viewport-wide cell it sits in (its width is bounded by the screen's
    // height). Left to shrink it collapses to the cell's width and takes the
    // photo down with it — barely half the size it should be. The rotation is
    // purely visual, so overflowing the cell is exactly right; the dialog clips.
    <div
      className={`relative flex shrink-0 ${rotated ? "rotate-90" : ""} [filter:drop-shadow(0_24px_45px_rgba(10,9,8,0.55))]`}
    >
      {/* Low-res (usually a cache hit from the page behind) — shows quickly, and
          sizes the unit that everything else is positioned against. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(item.url, 1600, 80)}
        alt={item.alt ?? ""}
        draggable={false}
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalHeight)
            onRatio(item.url, el.naturalWidth / el.naturalHeight);
        }}
        className={`select-none object-contain ${fitCls}`}
      />
      {/* High-res — crossfades in once downloaded, on capable screens. Only for
          the centred slide: neighbours exist to be ready, not to be studied, and
          tripling the hi-res traffic to prefetch them would defeat the point. */}
      {active && wantHiRes && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={optimizedSrc(item.url, 2560, 85)}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={() => setHiRes(true)}
          className={`pointer-events-none absolute inset-0 size-full select-none object-contain transition-opacity duration-500 ${
            hiRes ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {item.caption && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 sm:px-5 ${captionPad}`}
        >
          {/* A panel sized to the text, not a full-width gradient: the caption
              sits over the photo itself, where a scrim anchored to the screen's
              bottom edge would do nothing. */}
          <p className="max-w-3xl rounded-xl bg-ink-950/65 px-3 py-2 text-center text-sm leading-snug text-sand-50 shadow-lg backdrop-blur-md sm:text-base">
            {item.caption}
          </p>
        </div>
      )}
    </div>
  );
}
