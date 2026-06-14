import { searchPosts, searchPhotos } from "@/lib/content";
import { getReaderLocale } from "@/lib/i18n-server";
import { localizePost } from "@/lib/i18n-content";
import { PostCard } from "@/components/post-card";
import { PhotoResultCard } from "@/components/photo-result-card";
import { SearchBox } from "@/components/search-box";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("search.title") };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const locale = await getReaderLocale();
  // Hybrid search over stories and photos, fetched in parallel.
  const [rawPosts, rawPhotos] = query
    ? await Promise.all([searchPosts(query), searchPhotos(query)])
    : [[], []];
  const posts = rawPosts.map((p) => localizePost(p, locale));
  const photos = rawPhotos.map(({ i18n, post_i18n, ...ph }) => ({
    ...ph,
    caption: i18n?.[locale]?.caption ?? ph.caption,
    alt: i18n?.[locale]?.alt ?? ph.alt,
    post_title: post_i18n?.[locale]?.title ?? ph.post_title,
  }));
  const empty = query.length > 0 && posts.length === 0 && photos.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-28">
      <DocumentTitle k="search.title" />
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        <T k="search.title" />
      </h1>
      <p className="mt-2 text-sand-100/60">
        <T k="search.subtitle" />
      </p>

      <div className="mt-8 max-w-xl">
        <SearchBox initial={query} />
      </div>

      {empty && (
        <p className="mt-10 text-sm text-sand-100/50">
          <T k="search.noResults" vars={{ q: query }} />
        </p>
      )}

      {posts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-sand-100/50">
            <T k="search.stories" /> · {posts.length}
          </h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-medium uppercase tracking-wider text-sand-100/50">
            <T k="search.photos" /> · {photos.length}
          </h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <PhotoResultCard key={photo.id} photo={photo} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
