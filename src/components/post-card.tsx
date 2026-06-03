import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import type { PostWithRelations } from "@/lib/types";
import { formatDate, readingTime } from "@/lib/utils";

export function PostCard({
  post,
  priority = false,
}: {
  post: PostWithRelations;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group relative block overflow-hidden rounded-3xl bg-ink-800"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        {post.cover_image && (
          <Image
            src={post.cover_image}
            alt={post.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        {post.location && (
          <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ember-300">
            <MapPin className="size-3" />
            {post.location}
          </p>
        )}
        <h3 className="font-display text-2xl font-semibold leading-tight">
          {post.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-sand-100/70">
          {post.excerpt}
        </p>
        <p className="mt-3 text-xs text-sand-100/40">
          {formatDate(post.published_at)} · {readingTime(post.body)} min read
        </p>
      </div>
    </Link>
  );
}
