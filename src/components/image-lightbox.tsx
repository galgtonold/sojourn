"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { useT } from "@/components/i18n";

/**
 * A controlled, full-screen image viewer shared by article images and the
 * journey map.
 *
 * - When a `blurhash` is supplied, a blurred full-bleed backdrop paints
 *   instantly so the viewer never opens to a black screen while the photo
 *   downloads; the centred low-res copy then fades up, and the high-res version
 *   crossfades in over it.
 * - A clearly-landscape photo on a portrait phone is rotated 90° to fill the
 *   screen; rotation is recomputed when the device is turned.
 * - Open/close is animated (fade + scale); Escape and a backdrop click close it.
 */
export function ImageLightbox({
  open,
  src,
  alt = "",
  blurhash = null,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt?: string;
  blurhash?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [hiRes, setHiRes] = useState(false);
  const ratioRef = useRef(1); // natural width / height of the photo

  useEffect(() => setMounted(true), []);

  const shouldRotate = () =>
    typeof window !== "undefined" &&
    window.innerHeight > window.innerWidth &&
    ratioRef.current > 1.15;

  useEffect(() => {
    if (!open) return;
    setHiRes(false);
    const sync = () => setRotated(shouldRotate());
    sync();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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
  }, [open, onClose]);

  if (!mounted) return null;

  const sizeCls = rotated
    ? "max-h-[95vw] max-w-[92dvh]"
    : "max-h-[96dvh] max-w-[96vw]";
  const imgCls = `rounded-lg object-contain shadow-2xl ${rotated ? "rotate-90" : ""} ${sizeCls}`;
  // Instant placeholder: a decoded blurhash when we have one (no network at
  // all), otherwise a ~1 KB low-res of the same image. Either way the viewer
  // never opens to black while the full photo downloads.
  const backdrop =
    blurhashToDataURL(blurhash, 32, 32) ??
    (src ? optimizedSrc(src, 32, 25) : null);

  return createPortal(
    <AnimatePresence>
      {open && src && (
        <motion.div
          role="dialog"
          aria-modal="true"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-ink-950/90 p-2 backdrop-blur-sm sm:p-4"
        >
          {/* Instant blurred backdrop — keeps the viewer from flashing black. */}
          {backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backdrop}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
            />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-sand-50 transition hover:bg-white/20 sm:right-5 sm:top-5"
          >
            <X className="size-5" />
          </button>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative cursor-zoom-out"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Low-res (usually cached) — sizes the box and shows quickly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedSrc(src, 1600, 80)}
              alt={alt}
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalHeight) {
                  ratioRef.current = el.naturalWidth / el.naturalHeight;
                  setRotated(shouldRotate());
                }
              }}
              className={imgCls}
            />
            {/* High-res — crossfades in once it has downloaded. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedSrc(src, 2560, 85)}
              alt=""
              aria-hidden
              onLoad={() => setHiRes(true)}
              className={`absolute inset-0 transition-opacity duration-500 ${imgCls} ${
                hiRes ? "opacity-100" : "opacity-0"
              }`}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
