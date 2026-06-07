"use client";
import { decode } from "blurhash";

// Decoding requires a canvas, so this only works in the browser. Results are
// memoized — the same hash is decoded once per size, then reused.
const cache = new Map<string, string>();

/**
 * Decode a blurhash into a tiny PNG data URL suitable for use as a
 * `next/image` `blurDataURL` placeholder. Returns null on the server or on any
 * decode failure (callers fall back to their existing skeleton placeholder).
 */
export function blurhashToDataURL(
  hash: string | null | undefined,
  width = 32,
  height = 32,
): string | null {
  if (!hash || typeof document === "undefined") return null;

  const key = `${hash}:${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const pixels = decode(hash, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL();
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
