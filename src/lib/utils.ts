import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A URL-safe slug from arbitrary text. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

/** Human date like "12 May 2026". */
export function formatDate(
  value: string | null | undefined,
  // The reader's locale; defaults to the app's default (de). Callers pass the
  // resolved reader locale so month names match the page language.
  locale: "de" | "en" = "de",
): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Format in UTC, not the reader's timezone: a published date is a calendar day
  // (stored at noon UTC), so a reader in any timezone — and the SSR pass vs the
  // client hydration — must show the same day instead of flipping across the
  // local midnight boundary.
  return d.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Next's default allowed image widths (deviceSizes ∪ imageSizes). The optimizer
// rejects any other width with a 400, so we snap up to the nearest allowed one.
const NEXT_IMAGE_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
];

/**
 * Routes a remote image through Next's optimizer (resized + WebP/AVIF) instead
 * of serving the raw original.
 */
export function optimizedSrc(url: string, width = 2048, quality = 80): string {
  const w = NEXT_IMAGE_WIDTHS.find((x) => x >= width) ?? 3840;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${quality}`;
}

/**
 * Rough reading time in minutes — body words at ~220 wpm plus time to take in
 * the photos (tapering like Medium: 12s for the first image, 11s for the next,
 * … never below 3s), since a photo-heavy entry takes longer than its word count
 * alone suggests.
 */
export function readingTime(
  body: string | null | undefined,
  images = 0,
): number {
  const words = body ? body.trim().split(/\s+/).filter(Boolean).length : 0;
  let seconds = (words / 220) * 60;
  for (let i = 0; i < images; i++) seconds += Math.max(3, 12 - i);
  return Math.max(1, Math.round(seconds / 60));
}
