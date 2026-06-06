import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostEditor } from "@/components/post-editor";
import { getServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { T } from "@/components/i18n";

export const metadata = { title: "New post" };
export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const supabase = await getServerSupabase();
  const viewer = await getViewer();
  const { data: allTrips } = supabase
    ? await supabase
        .from("trips")
        .select("id, title")
        .order("start_date", { ascending: false })
    : { data: [] as { id: string; title: string }[] };
  const trips = viewer.isOwner
    ? (allTrips ?? [])
    : (allTrips ?? []).filter((t) => viewer.tripIds.includes(t.id));

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="mb-8 font-display text-4xl font-semibold">
        <T k="admin.editor.newPost" />
      </h1>
      <PostEditor trips={trips} />
    </div>
  );
}
