import { NotFoundView } from "@/components/not-found-view";
import { prerenderParams } from "@/lib/prerender";
import {
  getInteractions,
  getPostBySlug,
  getPostSummaries,
  getTripPostNav,
} from "@/lib/content";
import { getBranding } from "@/lib/branding";
import { env } from "@/lib/env";
import { shareImage } from "@/lib/utils";
import { PostView } from "@/components/post-view";

// Static, on-demand revalidation: the body is rendered in the default locale and
// localized to the reader's language on the client (PostView). Comments load
// client-side, so they stay fresh; interactions are authored content baked at
// build/revalidate time. Prebuilt for every published slug; new slugs render on
// first hit then cache. The translate Edge Function calls /api/revalidate once a
// post's i18n lands, so the translated version replaces the source-language build.
export const revalidate = false;

export async function generateStaticParams() {
  return prerenderParams("posts", async () => {
    const { posts } = await getPostSummaries({ limit: 1000 });
    return posts.map((p) => ({ slug: p.slug }));
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  // A slug that no longer resolves still returns metadata, because it still
  // returns a page (see below). Without `noindex` here a deleted entry stayed
  // indexable: the root not-found file carries that directive, and this route
  // never reaches it.
  if (!post) return { robots: { index: false, follow: false } };
  const path = `/posts/${slug}`;
  const images = post.cover_image
    ? [
        {
          url: shareImage(post.cover_image, env.siteUrl),
          alt: post.cover_alt ?? post.title,
        },
      ]
    : undefined;
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt ?? undefined,
      url: path,
      publishedTime: post.published_at ?? undefined,
      images,
    },
    twitter: { title: post.title, description: post.excerpt ?? undefined, images },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  // Rendered here rather than via notFound(). This route is prerendered with
  // `revalidate = false` and has a loading.tsx, so an unknown slug streamed a
  // shell whose Suspense fallback never resolved: the visitor got the header,
  // the footer, and an empty page between them — no message, nothing to click.
  // Verified in a browser, and adding not-found boundaries in the segment did
  // not change it. Returning the view directly sidesteps boundary resolution
  // entirely and always renders. See docs/qa/03-bug-log.md (BUG-001) for why
  // the status stays 200; `robots: noindex` above keeps it out of search.
  if (!post) return <NotFoundView />;

  // Interactions are authored content (safe fields only) — baked into the cached
  // page and refreshed on edit. Comments self-fetch on the client, so pass none.
  const interactions = await getInteractions(post.id);
  // Prev/next within the trip, for reading a multi-day journey straight through.
  const nav = post.trip_id
    ? await getTripPostNav(post.trip_id, slug)
    : { prev: null, next: null };

  const { name: siteName } = await getBranding();
  const base = env.siteUrl.replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_image ?? undefined,
    datePublished: post.published_at ?? undefined,
    url: `${base}/posts/${slug}`,
    author: { "@type": "Organization", name: siteName },
    publisher: { "@type": "Organization", name: siteName },
  };
  return (
    <>
      <script
        type="application/ld+json"
        // Escape "<" so a title/excerpt containing "</script>" can't break out.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <PostView post={post} comments={[]} interactions={interactions} nav={nav} />
    </>
  );
}
