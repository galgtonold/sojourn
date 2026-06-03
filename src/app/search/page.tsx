import { searchPosts } from "@/lib/content";
import { PostCard } from "@/components/post-card";
import { SearchBox } from "@/components/search-box";

export const metadata = { title: "Search" };

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
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">Search</h1>
      <p className="mt-2 text-sand-100/60">
        Find a place, a trip, or a moment.
      </p>

      <div className="mt-8 max-w-xl">
        <SearchBox initial={query} />
      </div>

      {query && (
        <p className="mt-8 text-sm text-sand-100/50">
          {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
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
