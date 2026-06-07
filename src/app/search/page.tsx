import { searchPosts } from "@/lib/content";
import { PostCard } from "@/components/post-card";
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
  const results = query ? await searchPosts(query) : [];

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

      {query && (
        <p className="mt-8 text-sm text-sand-100/50">
          <T
            k={results.length === 1 ? "search.result" : "search.results"}
            vars={{ n: results.length, q: query }}
          />
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
