import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { PostEditor, type EditablePost } from "@/components/post-editor";
import { PhotoManager } from "@/components/photo-manager";

export const metadata = { title: "Edit post" };
export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured) {
    // No backend in demo mode — editing requires Supabase.
    redirect("/admin");
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase!
    .from("posts")
    .select(
      "id, title, slug, location, excerpt, body, cover_image, lat, lng, published",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const { data: photos } = await supabase!
    .from("photos")
    .select("id, url, storage_path, caption, sort_order")
    .eq("post_id", id)
    .order("sort_order", { ascending: true });

  const initial: EditablePost = {
    id: data.id,
    title: data.title ?? "",
    slug: data.slug ?? "",
    location: data.location ?? "",
    excerpt: data.excerpt ?? "",
    body: data.body ?? "",
    cover_image: data.cover_image ?? "",
    lat: data.lat != null ? String(data.lat) : "",
    lng: data.lng != null ? String(data.lng) : "",
    published: Boolean(data.published),
  };

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-8 font-display text-4xl font-semibold">Edit post</h1>
      <PostEditor initial={initial} />

      <div className="mt-12 border-t border-white/10 pt-10">
        <PhotoManager postId={data.id} initial={photos ?? []} />
      </div>
    </div>
  );
}
