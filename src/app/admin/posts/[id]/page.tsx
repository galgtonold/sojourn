import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { PostEditor, type EditablePost } from "@/components/post-editor";
import { PhotoManager } from "@/components/photo-manager";
import { TrackManager } from "@/components/track-manager";
import { InteractionManager } from "@/components/interaction-manager";

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
      "id, title, slug, location, excerpt, body, cover_image, cover_alt, trip_id, lat, lng, published",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const { data: photos } = await supabase!
    .from("photos")
    .select("id, url, storage_path, caption, alt, lat, lng, sort_order")
    .eq("post_id", id)
    .order("sort_order", { ascending: true });

  const { data: tracks } = await supabase!
    .from("tracks")
    .select("id, name, distance_m")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  const { data: interactions } = await supabase!
    .from("interactions")
    .select("id, kind, question, options, correct_index, explanation")
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
    cover_alt: data.cover_alt ?? "",
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
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-semibold">Edit post</h1>
        <a
          href={`/admin/posts/${data.id}/preview`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
        >
          <Eye className="size-4" /> Preview
        </a>
      </div>
      <PostEditor initial={initial} />

      <div className="mt-12 border-t border-white/10 pt-10">
        <TrackManager
          postId={data.id}
          tripId={data.trip_id ?? null}
          slug={data.slug ?? ""}
          initial={tracks ?? []}
        />
      </div>

      <div className="mt-12 border-t border-white/10 pt-10">
        <PhotoManager
          postId={data.id}
          slug={data.slug ?? ""}
          initial={photos ?? []}
        />
      </div>

      <div className="mt-12 border-t border-white/10 pt-10">
        <InteractionManager
          postId={data.id}
          slug={data.slug ?? ""}
          initial={interactions ?? []}
        />
      </div>
    </div>
  );
}
