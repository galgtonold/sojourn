import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getPublishedPosts, getTrips } from "@/lib/content";
import { getViewer } from "@/lib/auth";
import { PostsAdmin, type AdminPostRow } from "@/components/posts-admin";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("meta.adminPosts") };
export const dynamic = "force-dynamic";

export default async function PostsAdminPage() {
  const viewer = await getViewer();
  const allTrips = await getTrips();
  const tripById: Record<string, string> = Object.fromEntries(
    allTrips.map((t) => [t.id, t.title]),
  );

  let rows: AdminPostRow[] = [];
  const supabase = await getServerSupabase();
  if (supabase) {
    const scope = viewer.isOwner
      ? null
      : viewer.tripIds.length
        ? viewer.tripIds
        : ["00000000-0000-0000-0000-000000000000"];
    let query = supabase
      .from("posts")
      .select("id, title, slug, published, published_at, trip_id, cover_image")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (scope) query = query.in("trip_id", scope);
    const { data } = await query;
    rows = (data ?? []) as AdminPostRow[];
  } else {
    rows = (await getPublishedPosts()).map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      published: p.published,
      published_at: p.published_at,
      trip_id: p.trip_id,
      cover_image: p.cover_image,
    }));
  }

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

      {!isSupabaseConfigured ? (
        <p className="rounded-2xl bg-ember-600/15 p-4 text-sm text-ember-300">
          <T k="admin.demoNotice" />
        </p>
      ) : (
        <PostsAdmin initial={rows} trips={tripById} />
      )}
    </div>
  );
}
