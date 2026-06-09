import Link from "next/link";
import { ImageIcon } from "lucide-react";
import type { PhotoSearchResult } from "@/lib/types";
import { RevealImage } from "@/components/reveal-image";

// A photo surfaced by search. Links back to the story it belongs to; the caption
// (falling back to AI description / place) and parent title sit over the image.
export function PhotoResultCard({ photo }: { photo: PhotoSearchResult }) {
  const label =
    photo.caption || photo.place_name || photo.ai_description || photo.alt;
  return (
    <Link
      href={`/posts/${photo.post_slug}`}
      className="group relative block overflow-hidden rounded-3xl bg-ink-950"
    >
      <div className="relative aspect-square w-full overflow-hidden [clip-path:inset(2px)]">
        {photo.url ? (
          <RevealImage
            src={photo.url}
            alt={photo.alt ?? label ?? photo.post_title}
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            imgClassName="transition-transform duration-700 ease-out group-hover:scale-105"
            overlay={
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 from-[20%] via-ink-950/40 to-transparent" />
            }
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 from-[20%] via-ink-950/40 to-transparent" />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ember-300">
          <ImageIcon className="size-3" />
          {photo.post_title}
        </p>
        {label && (
          <p className="mt-1 line-clamp-2 text-sm text-sand-100/85">{label}</p>
        )}
      </div>
    </Link>
  );
}
