"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PhotoSearchResult, PostSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PostCard } from "@/components/post-card";
import { PhotoResultCard } from "@/components/photo-result-card";
import { T, useI18n } from "@/components/i18n";

type Results = { posts: PostSummary[]; photos: PhotoSearchResult[] };

/**
 * Client-driven search results. The /search page is statically cached; this
 * reads the `?q` query, fetches `/api/search` (which embeds the query once and
 * runs both hybrid searches in parallel), and renders results — so loading the
 * page is instant and searching shows a spinner instead of a full SSR nav.
 */
export function SearchResults() {
  const q = (useSearchParams().get("q") ?? "").trim();
  const { locale } = useI18n();
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { posts: [], photos: [] }))
      .then((d: Results) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ posts: [], photos: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  if (!q) return null;

  // First search (nothing on screen yet): a centered "Searching…" indicator.
  if (loading && !data) {
    return (
      <div className="mt-12 flex items-center justify-center gap-2 text-sand-100/70">
        <Loader2 className="size-5 animate-spin text-ember-400" />
        <T k="search.searching" />
      </div>
    );
  }

  const posts = data?.posts ?? [];
  // PhotoResultCard takes pre-localized text; overlay the reader's language here.
  const photos = (data?.photos ?? []).map((ph) => ({
    ...ph,
    caption: ph.i18n?.[locale]?.caption ?? ph.caption,
    post_title: ph.post_i18n?.[locale]?.title ?? ph.post_title,
  }));
  const empty = !loading && posts.length === 0 && photos.length === 0;

  return (
    <>
      {/* Re-search while previous results are still shown: a clear in-progress
          badge, with the stale results dimmed so it's obvious they're updating. */}
      {loading && (
        <div className="mt-8 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ink-800 px-4 py-2 text-sm text-sand-100/80">
            <Loader2 className="size-4 animate-spin text-ember-400" />
            <T k="search.searching" />
          </span>
        </div>
      )}

      <div
        aria-busy={loading}
        className={cn(
          "transition-opacity duration-200",
          loading && "pointer-events-none opacity-40",
        )}
      >
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
      </div>
    </>
  );
}
