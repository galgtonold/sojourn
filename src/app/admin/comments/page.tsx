import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/auth";
import {
  CommentModeration,
  type ModerationRow,
} from "@/components/comment-moderation";
import { T } from "@/components/i18n";

export const metadata = { title: "Comments" };
export const dynamic = "force-dynamic";

async function load(): Promise<ModerationRow[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];

  // Members only moderate comments on posts within their granted trips.
  const viewer = await getViewer();
  let postIds: string[] | null = null;
  if (!viewer.isOwner) {
    const scope = viewer.tripIds.length
      ? viewer.tripIds
      : ["00000000-0000-0000-0000-000000000000"];
    const { data: myPosts } = await supabase
      .from("posts")
      .select("id")
      .in("trip_id", scope);
    postIds = (myPosts ?? []).map((p) => p.id as string);
    if (postIds.length === 0) return [];
  }

  let query = supabase
    .from("comments")
    .select(
      "id, body, author_name, created_at, hidden, parent_id, post_id, posts(title, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (postIds) query = query.in("post_id", postIds);
  const { data } = await query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => {
    const post = Array.isArray(c.posts) ? c.posts[0] : c.posts;
    return {
      id: c.id,
      body: c.body,
      author_name: c.author_name,
      created_at: c.created_at,
      hidden: c.hidden,
      parent_id: c.parent_id,
      post_title: post?.title ?? "—",
      post_slug: post?.slug ?? "",
    };
  });
}

export default async function CommentsAdminPage() {
  const rows = await load();

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>
      <h1 className="mb-2 font-display text-4xl font-semibold">
        <T k="admin.cmod.title" />
      </h1>
      <p className="mb-8 text-sm text-sand-100/50">
        <T k="admin.cmod.subtitle" />
        {rows.length >= 200 && <T k="admin.cmod.recent200" />}
      </p>

      {!isSupabaseConfigured ? (
        <p className="text-sand-100/50">
          <T k="admin.cmod.connect" />
        </p>
      ) : (
        <CommentModeration initial={rows} />
      )}
    </div>
  );
}
