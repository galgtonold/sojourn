import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPostSummaries } from "@/lib/content";
import { PostCard } from "@/components/post-card";

export const revalidate = 60;
export const metadata = { title: "All entries" };

const PER_PAGE = 12;

export default async function PostsArchive({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { posts, total } = await getPostSummaries({
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        All entries
      </h1>
      <p className="mt-2 text-sand-100/60">{total} stories from the road.</p>

      {posts.length === 0 ? (
        <p className="mt-10 text-sand-100/60">Nothing here yet.</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} priority={i < 3} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-12 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/posts?page=${page - 1}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400"
            >
              <ArrowLeft className="size-4" /> Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-sand-100/50">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/posts?page=${page + 1}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400"
            >
              Older <ArrowRight className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
