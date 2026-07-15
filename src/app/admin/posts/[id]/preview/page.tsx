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

  // The route param IS the post id (getPostForPreview keys off .eq("id", id)),
  // so comments/interactions don't actually depend on the post row — one wave.
  const [post, comments, interactions] = await Promise.all([
    getPostForPreview(id),
    getComments(id),
    getInteractions(id),
  ]);
  if (!post) notFound();
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
