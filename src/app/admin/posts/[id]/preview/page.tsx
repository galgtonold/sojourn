import { notFound } from "next/navigation";
import { getComments, getInteractions, getPostForPreview } from "@/lib/content";
import { PostView } from "@/components/post-view";

export const metadata = { title: "Preview" };
export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostForPreview(id);
  if (!post) notFound();

  const [comments, interactions] = await Promise.all([
    getComments(post.id),
    getInteractions(post.id),
  ]);
  return (
    <PostView
      post={post}
      comments={comments}
      interactions={interactions}
      preview
    />
  );
}
