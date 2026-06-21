"use client";
import { useEffect, useReducer, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PhotoSearchResult, PostSummary } from "@/lib/types";
import { PostCard } from "@/components/post-card";
import { PhotoResultCard } from "@/components/photo-result-card";
import { T, useI18n } from "@/components/i18n";

type Results = { posts: PostSummary[]; photos: PhotoSearchResult[] };

// Module-level cache: survives client-side back/forward navigation, so returning
// to a search renders the SAME results instantly from memory — no re-fetch, no
// flash, and the browser can restore the scroll position. Keyed by query, so the
// rendered results always match the URL's `?q` (never a stale/unrelated set).
const cache = new Map<string, Results>();
const CACHE_LIMIT = 30;

function remember(q: string, r: Results) {
  cache.set(q, r);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/**
 * Client-driven search results. The /search page is statically cached; this
 * reads `?q`, fetches `/api/search`, and renders results — and caches them per
 * query so navigating away and back is instant (with scroll restored).
 */
export function SearchResults() {
  const q = (useSearchParams().get("q") ?? "").trim();
  const { locale } = useI18n();
  const [, rerender] = useReducer((n) => n + 1, 0);
  // The query currently being fetched (so the "Searching…" state is tied to the
  // live query, never a stale one).
  const [loadingQ, setLoadingQ] = useState<string | null>(null);

  useEffect(() => {
    // Nothing to do when blank or already cached (the back-button case).
    if (!q || cache.has(q)) {
      setLoadingQ(null);
      return;
    }
    let cancelled = false;
    setLoadingQ(q);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { posts: [], photos: [] }))
      .then((d: Results) => remember(q, d))
      .catch(() => remember(q, { posts: [], photos: [] }))
      .finally(() => {
        if (!cancelled) {
          setLoadingQ(null);
          rerender();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  if (!q) return null;

  const data = cache.get(q) ?? null;

  // No results for this query yet → a centered "Searching…" indicator. (Cached
  // queries skip this entirely and render below instantly.)
  if (!data) {
    return (
      <div className="mt-12 flex items-center justify-center gap-2 text-sand-100/70">
        <Loader2 className="size-5 animate-spin text-ember-400" />
        <T k="search.searching" />
      </div>
    );
  }

  const posts = data.posts;
  // PhotoResultCard takes pre-localized text; overlay the reader's language here.
  const photos = data.photos.map((ph) => ({
    ...ph,
    caption: ph.i18n?.[locale]?.caption ?? ph.caption,
    post_title: ph.post_i18n?.[locale]?.title ?? ph.post_title,
  }));
  const empty = posts.length === 0 && photos.length === 0;

  return (
    <>
      {empty && (
        <p className="mt-10 text-sm text-sand-100/50">
          <T k="search.noResults" vars={{ q }} />
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
    </>
  );
}
