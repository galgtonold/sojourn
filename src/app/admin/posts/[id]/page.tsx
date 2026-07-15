import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai-config";
import { getViewer } from "@/lib/auth";
import { PostWorkspace, type EditablePost } from "@/components/post-workspace";
import type { ManagedInteraction } from "@/components/interaction-manager";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.editPost") };
export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await getServerSupabase();

  // One wave, not seven serial round trips. photos/tracks/interactions/trips
  // depend only on `id` — not on each other, and not on the post row — and
  // viewer/AI config depend on nothing. The notFound() branch below still gates
  // rendering; on a missing post the other queries are wasted, but they cost
  // nothing extra because they ran concurrently, and a 404 here is rare.
  const [
    { data, error },
    { data: photos },
    { data: tracks },
    { data: interactions },
    { data: allTrips },
    viewer,
    { isAiConfigured },
  ] = await Promise.all([
    supabase!
      .from("posts")
      .select(
        "id, title, slug, location, excerpt, body, cover_image, cover_alt, trip_id, lat, lng, published, published_at, ai_notes, photos_manual_order, updated_at, translation_status, source_locale",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase!
      .from("photos")
      .select(
        "id, url, storage_path, caption, alt, lat, lng, place_name, width, height, blurhash, sort_order",
      )
      .eq("post_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase!
      .from("tracks")
      .select("id, name, distance_m, geojson")
      .eq("post_id", id)
      .order("created_at", { ascending: true }),
    supabase!
      .from("interactions")
      .select("id, kind, question, options, correct_index, explanation")
      .eq("post_id", id)
      .order("sort_order", { ascending: true }),
    supabase!
      .from("trips")
      .select("id, title")
      .order("start_date", { ascending: false }),
    getViewer(),
    getAiConfig(),
  ]);

  if (error || !data) notFound();

  const trips = viewer.isOwner
    ? (allTrips ?? [])
    : (allTrips ?? []).filter((t) => viewer.tripIds.includes(t.id));

  // Auto-infer the post location from the cover (or first) geotagged photo's
  // cached place name when the post has none — so an EXIF-located photo fills in
  // a coarse location without manual entry. (The AI draft flow does the same on
  // generate; this covers posts edited without it.)
  const geoPhoto =
    (photos ?? []).find(
      (ph) => ph.url === data.cover_image && ph.lat != null && ph.place_name,
    ) ??
    (photos ?? []).find(
      (ph) => ph.lat != null && ph.lng != null && ph.place_name,
    );

  const initial: EditablePost = {
    id: data.id,
    title: data.title ?? "",
    slug: data.slug ?? "",
    location: data.location || geoPhoto?.place_name || "",
    excerpt: data.excerpt ?? "",
    body: data.body ?? "",
    cover_image: data.cover_image ?? "",
    cover_alt: data.cover_alt ?? "",
    trip_id: data.trip_id ?? "",
    date: data.published_at ? String(data.published_at).slice(0, 10) : "",
    lat:
      data.lat != null
        ? String(data.lat)
        : geoPhoto?.lat != null
          ? String(geoPhoto.lat)
          : "",
    lng:
      data.lng != null
        ? String(data.lng)
        : geoPhoto?.lng != null
          ? String(geoPhoto.lng)
          : "",
    published: Boolean(data.published),
  };

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k={data.title ? "meta.editPost" : "meta.newPost"} />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="mb-2 font-display text-4xl font-semibold">
        <T k={data.title ? "admin.editor.editPost" : "admin.editor.newPost"} />
      </h1>
      <PostWorkspace
        postId={data.id}
        slug={data.slug ?? ""}
        initial={initial}
        initialNotes={data.ai_notes ?? ""}
        initialPhotoManualOrder={data.photos_manual_order ?? false}
        aiConfigured={isAiConfigured}
        trips={trips}
        initialPhotos={photos ?? []}
        tracks={tracks ?? []}
        initialInteractions={(interactions ?? []) as ManagedInteraction[]}
        translationStatus={(data.translation_status as "none" | "pending" | "ready" | "error") ?? "none"}
      />
    </div>
  );
}
