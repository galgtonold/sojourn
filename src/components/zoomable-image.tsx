"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { optimizedSrc } from "@/lib/utils";
import { useT } from "@/components/i18n";

/**
 * An inline article image that opens into a full-screen lightbox on click.
 *
 * - The overlay is rendered through a portal to `document.body` so it escapes the
 *   transformed reveal-animation ancestors (a `position: fixed` child of a
 *   `transform`ed element is sized relative to that element, not the viewport).
 * - A landscape photo viewed on a portrait phone is rotated 90° so it fills the
 *   screen instead of sitting as a thin letterboxed strip; rotation is
 *   recomputed when the device is turned.
 * - Open/close is animated (fade + scale) with Motion.
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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [rotated, setRotated] = useState(false);
  const ratioRef = useRef(1); // natural width / height of the photo

  useEffect(() => setMounted(true), []);

  // Rotate only when it genuinely fills better: a clearly-landscape photo on a
  // portrait viewport. Recompute when the phone is turned or the window resizes.
  const shouldRotate = () =>
    window.innerHeight > window.innerWidth && ratioRef.current > 1.15;

  useEffect(() => {
    if (!open) return;
    const sync = () => setRotated(shouldRotate());
    sync();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
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
        onLoad={(e) => {
          const el = e.currentTarget;
          if (el.naturalHeight) ratioRef.current = el.naturalWidth / el.naturalHeight;
        }}
        onClick={() => {
          setRotated(shouldRotate());
          setOpen(true);
        }}
        className={`${className ?? ""} cursor-zoom-in`.trim()}
      />
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                role="dialog"
                aria-modal="true"
                onClick={() => setOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-ink-950/95 p-2 backdrop-blur-sm sm:p-4"
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
                <motion.img
                  src={optimizedSrc(src, 2560, 85)}
                  alt={alt}
                  initial={{ opacity: 0, scale: 0.92, rotate: rotated ? 90 : 0 }}
                  animate={{ opacity: 1, scale: 1, rotate: rotated ? 90 : 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                  className={`cursor-zoom-out rounded-lg object-contain shadow-2xl ${
                    rotated ? "max-h-[95vw] max-w-[92dvh]" : "max-h-[96dvh] max-w-[96vw]"
                  }`}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
