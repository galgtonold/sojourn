import { notFound } from "next/navigation";
import { getComments, getInteractions, getPostForPreview } from "@/lib/content";
import { PostView } from "@/components/post-view";
import { DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.preview") };
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
    <>
      <DocumentTitle k="meta.preview" />
      <PostView
        post={post}
        comments={comments}
        interactions={interactions}
        preview
      />
    </>
  );
}
