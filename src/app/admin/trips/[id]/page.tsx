import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/auth";
import { TripEditor, type EditableTrip } from "@/components/trip-editor";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.editTrip") };
export const dynamic = "force-dynamic";

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured) redirect("/admin");

  const viewer = await getViewer();
  if (!viewer.isOwner && !viewer.tripIds.includes(id)) redirect("/admin");

  const supabase = await getServerSupabase();
  const { data, error } = await supabase!
    .from("trips")
    .select("id, title, slug, summary, ai_context, cover_image, start_date, end_date")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const initial: EditableTrip = {
    id: data.id,
    title: data.title ?? "",
    slug: data.slug ?? "",
    summary: data.summary ?? "",
    ai_context: data.ai_context ?? "",
    cover_image: data.cover_image ?? "",
    start_date: data.start_date ?? "",
    end_date: data.end_date ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.editTrip" />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="mb-8 font-display text-4xl font-semibold">
        <T k="admin.trip.editTrip" />
      </h1>
      <TripEditor initial={initial} canDelete={viewer.isOwner} />
    </div>
  );
}
