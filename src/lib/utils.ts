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
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
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

/** Rough reading time in minutes from body text. */
export function readingTime(body: string | null | undefined): number {
  if (!body) return 1;
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
