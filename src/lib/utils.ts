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
 * A cover photo as an `og:image`: resized, and absolute.
 *
 * Both halves matter. A full-size cover is several hundred KB to a few MB of
 * original camera JPEG, which every unfurler downloads before it can draw the
 * card — so the preview lags behind the message that contains it. 1200px wide
 * is what the platforms display at.
 *
 * And the URL must be absolute: a relative `og:image` is discarded by every
 * scraper without complaint, so the page keeps its tag and the card silently
 * has no picture — a failure that looks exactly like success from the outside.
 *
 * Format negotiation is safe here, checked against real user agents: Next's
 * optimizer answers a wildcard Accept header — which is what Facebook, Twitter
 * and Slack send — with JPEG, and only serves WebP/AVIF to clients that name
 * them explicitly.
 */
export function shareImage(url: string, siteUrl: string): string {
  const path = optimizedSrc(url, 1200, 75);
  return `${siteUrl.replace(/\/$/, "")}${path}`;
}

/**
 * A deterministic, on-brand dark gradient derived from a seed string (a slug or
 * title) — so a post/trip with no cover image still gets a distinctive backdrop
 * instead of a flat black rectangle. Stays dark enough for white overlay text.
 */
export function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  // Bias toward the warm ember/sand half of the wheel (the brand palette).
  const hue = 18 + (h % 60); // ~18°–78° (amber → gold)
  const hue2 = (hue + 24) % 360;
  return `linear-gradient(150deg, hsl(${hue} 42% 16%), hsl(${hue2} 38% 8%))`;
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

