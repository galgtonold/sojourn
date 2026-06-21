import { notFound } from "next/navigation";
import { getInteractions, getPostBySlug, getPostSummaries } from "@/lib/content";
import { PostView } from "@/components/post-view";

// Static + ISR: the body is rendered in the default locale and localized to the
// reader's language on the client (PostView). Comments load client-side, so they
// stay fresh; interactions are authored content baked at build/revalidate time.
// Prebuilt for every published slug; new slugs render on first hit then cache.
export const revalidate = 3600;

export async function generateStaticParams() {
  const { posts } = await getPostSummaries({ limit: 1000 });
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      images: post.cover_image ? [post.cover_image] : undefined,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  // Interactions are authored content (safe fields only) — baked into the cached
  // page and refreshed on edit. Comments self-fetch on the client, so pass none.
  const interactions = await getInteractions(post.id);
  return <PostView post={post} comments={[]} interactions={interactions} />;
}
