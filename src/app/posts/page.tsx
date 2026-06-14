import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPostSummaries } from "@/lib/content";
import { getReaderLocale } from "@/lib/i18n-server";
import { localizePostSummary } from "@/lib/i18n-content";
import { PostCard } from "@/components/post-card";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: defaultTitle("meta.posts") };

const PER_PAGE = 12;

export default async function PostsArchive({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const locale = await getReaderLocale();
  const { posts: rawPosts, total } = await getPostSummaries({
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });
  const posts = rawPosts.map((p) => localizePostSummary(p, locale));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.posts" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="archive.title" />
      </h1>
      <p className="mt-2 text-sand-100/60">
        <T k="archive.subtitle" vars={{ n: total }} />
      </p>

      {posts.length === 0 ? (
        <p className="mt-10 text-sand-100/60">
          <T k="archive.empty" />
        </p>
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
    </div>
  );
}
