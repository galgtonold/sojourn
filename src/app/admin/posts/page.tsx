import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { getTripsForEditor } from "@/lib/content";
import { getViewer } from "@/lib/auth";
import { PostsAdmin, type AdminPostRow } from "@/components/posts-admin";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.adminPosts") };
export const dynamic = "force-dynamic";

export default async function PostsAdminPage() {
  // Editor-scoped, not public: the anon client cannot see a trip with nothing
  // published in it, so a draft in a brand-new trip would list with no trip
  // name at all. Neither call takes arguments, so both still fire in one wave.
  const [viewer, allTrips] = await Promise.all([
    getViewer(),
    getTripsForEditor(),
  ]);
  const tripById: Record<string, string> = Object.fromEntries(
    allTrips.map((t) => [t.id, t.title]),
  );

  const supabase = await getServerSupabase();
  const scope = viewer.isOwner
    ? null
    : viewer.tripIds.length
      ? viewer.tripIds
      : ["00000000-0000-0000-0000-000000000000"];
  let query = supabase
    .from("posts")
    .select("id, title, slug, published, published_at, created_at, trip_id, cover_image")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (scope) query = query.in("trip_id", scope);
  const { data } = await query;
  const rows = (data ?? []) as AdminPostRow[];

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.adminPosts" />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">
            <T k="admin.posts.title" />
          </h1>
          <p className="mt-1 text-sm text-sand-100/50">
            <T k="admin.posts.subtitle" vars={{ n: rows.length }} />
          </p>
        </div>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          <Plus className="size-4" /> <T k="admin.newPost" />
        </Link>
      </div>

      <PostsAdmin initial={rows} trips={tripById} />
    </div>
  );
}
