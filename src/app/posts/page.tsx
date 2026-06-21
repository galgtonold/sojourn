import { Suspense } from "react";
import { getPostSummaries } from "@/lib/content";
import { PostsArchive } from "@/components/posts-archive";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.posts") };
// Static, on-demand revalidation: the whole (small) published set ships once;
// PostsArchive slices it by `?page` on the client, so the route never goes
// dynamic on searchParams.
export const revalidate = false;

export default async function PostsPage() {
  const { posts, total } = await getPostSummaries({ limit: 1000 });

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.posts" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="archive.title" />
      </h1>
      <p className="mt-2 text-sand-100/60">
        <T k="archive.subtitle" vars={{ n: total }} />
      </p>

      <Suspense>
        <PostsArchive posts={posts} total={total} />
      </Suspense>
    </div>
  );
}
