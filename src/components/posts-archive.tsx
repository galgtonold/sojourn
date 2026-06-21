"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { PostSummary } from "@/lib/types";
import { PostCard } from "@/components/post-card";
import { T } from "@/components/i18n";

const PER_PAGE = 12;

/**
 * Client-side paginated post grid. The whole (small) published set ships in the
 * static page; this slices it by the `?page` query param on the client, so the
 * archive route stays statically cached instead of going dynamic on searchParams.
 */
export function PostsArchive({
  posts,
  total,
}: {
  posts: PostSummary[];
  total: number;
}) {
  const sp = useSearchParams();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const start = (page - 1) * PER_PAGE;
  const pagePosts = posts.slice(start, start + PER_PAGE);

  if (pagePosts.length === 0) {
    return (
      <p className="mt-10 text-sand-100/60">
        <T k="archive.empty" />
      </p>
    );
  }

  return (
    <>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pagePosts.map((post, i) => (
          <PostCard key={post.id} post={post} priority={i < 3} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="mt-12 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/posts?page=${page - 1}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400"
            >
              <ArrowLeft className="size-4" /> <T k="common.newer" />
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-sand-100/50">
            <T k="common.page" vars={{ a: page, b: totalPages }} />
          </span>
          {page < totalPages ? (
            <Link
              href={`/posts?page=${page + 1}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400"
            >
              <T k="common.older" /> <ArrowRight className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
