"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { optimizedSrc } from "@/lib/utils";
import { useT } from "@/components/i18n";

/**
 * An inline article image that opens into a full-screen lightbox on click.
 *
 * The overlay is rendered through a portal to `document.body` so it escapes the
 * transformed reveal-animation ancestors (a `position: fixed` child of a
 * `transform`ed element is sized relative to that element, not the viewport).
 * The image is sized with viewport units + `object-contain`, so it fills the
 * screen nicely in either orientation and re-fits when the device is rotated.
 */
export function ZoomableImage({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the lightbox is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(src, 1600, 80)}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className={`${className ?? ""} cursor-zoom-in`.trim()}
      />
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-ink-950/95 p-3 backdrop-blur-sm sm:p-6"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("common.close")}
              className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-sand-50 transition hover:bg-white/20 sm:right-5 sm:top-5"
            >
              <X className="size-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedSrc(src, 2560, 85)}
              alt={alt}
              className="max-h-[92dvh] max-w-[96vw] cursor-zoom-out rounded-lg object-contain"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
