import { notFound } from "next/navigation";
import { getComments, getInteractions, getPostBySlug } from "@/lib/content";
import { getReaderLocale } from "@/lib/i18n-server";
import { localizeInteraction, localizePostDeep } from "@/lib/i18n-content";
import { PostView } from "@/components/post-view";

// Dynamic: the body is rendered server-side, so it picks the reader's language
// from the `locale` cookie here (UI chrome still swaps on the client). Metadata
// stays in the source/default language for crawlers and link previews.
export const dynamic = "force-dynamic";

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
  const [post, locale] = await Promise.all([
    getPostBySlug(slug),
    getReaderLocale(),
  ]);
  if (!post) notFound();

  const [comments, interactions] = await Promise.all([
    getComments(post.id),
    getInteractions(post.id),
  ]);
  return (
    <PostView
      post={localizePostDeep(post, locale)}
      comments={comments}
      interactions={interactions.map((it) => localizeInteraction(it, locale))}
    />
  );
}
