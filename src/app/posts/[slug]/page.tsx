import { notFound } from "next/navigation";
import {
  getComments,
  getInteractions,
  getPostBySlug,
  getPublishedPosts,
} from "@/lib/content";
import { PostView } from "@/components/post-view";

export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
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

  const [comments, interactions] = await Promise.all([
    getComments(post.id),
    getInteractions(post.id),
  ]);
  return (
    <PostView post={post} comments={comments} interactions={interactions} />
  );
}
