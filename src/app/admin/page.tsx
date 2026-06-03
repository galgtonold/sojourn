import Link from "next/link";
import { FileText, MessageSquare, Plus } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getPublishedPosts } from "@/lib/content";
import { PushToggle } from "@/components/push-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

async function loadStats() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    const posts = await getPublishedPosts();
    return {
      email: null as string | null,
      postCount: posts.length,
      commentCount: 0,
      recentComments: [] as {
        id: string;
        author_name: string;
        body: string;
        created_at: string;
      }[],
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        published: p.published,
      })),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ count: postCount }, { count: commentCount }, comments, posts] =
    await Promise.all([
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("comments").select("*", { count: "exact", head: true }),
      supabase
        .from("comments")
        .select("id, author_name, body, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("posts")
        .select("id, title, slug, published")
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

  return {
    email: user?.email ?? null,
    postCount: postCount ?? 0,
    commentCount: commentCount ?? 0,
    recentComments: comments.data ?? [],
    posts: posts.data ?? [],
  };
}

export default async function AdminDashboard() {
  const stats = await loadStats();

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-28">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">Dashboard</h1>
          {stats.email && (
            <p className="mt-1 text-sm text-sand-100/50">
              Signed in as {stats.email}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PushToggle />
          {isSupabaseConfigured && <SignOutButton />}
        </div>
      </div>

      {!isSupabaseConfigured && (
        <p className="mt-6 rounded-2xl bg-ember-600/15 p-4 text-sm text-ember-300">
          Demo mode — connect Supabase and create an admin user to manage real
          content.
        </p>
      )}

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
          <FileText className="size-5 text-ember-400" />
          <p className="mt-3 font-display text-3xl font-semibold">
            {stats.postCount}
          </p>
          <p className="text-sm text-sand-100/50">Posts</p>
        </div>
        <div className="rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
          <MessageSquare className="size-5 text-lagoon-400" />
          <p className="mt-3 font-display text-3xl font-semibold">
            {stats.commentCount}
          </p>
          <p className="text-sm text-sand-100/50">Comments</p>
        </div>
      </div>

      {/* Posts */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">Posts</h2>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          <Plus className="size-4" /> New post
        </Link>
      </div>
      <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
        {stats.posts.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between px-5 py-3.5"
          >
            <span className="truncate">{p.title}</span>
            <span className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  p.published
                    ? "bg-lagoon-500/15 text-lagoon-400"
                    : "bg-white/10 text-sand-100/60"
                }`}
              >
                {p.published ? "Published" : "Draft"}
              </span>
              <Link
                href={`/admin/posts/${p.id}`}
                className="text-sm text-ember-400 hover:underline"
              >
                Edit
              </Link>
            </span>
          </li>
        ))}
        {stats.posts.length === 0 && (
          <li className="px-5 py-4 text-sand-100/50">No posts yet.</li>
        )}
      </ul>

      {/* Recent comments */}
      <h2 className="mt-10 font-display text-2xl font-semibold">
        Recent comments
      </h2>
      <ul className="mt-4 space-y-3">
        {stats.recentComments.map((c) => (
          <li key={c.id} className="rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{c.author_name}</span>
              <span className="text-sand-100/40">
                {formatDate(c.created_at)}
              </span>
            </div>
            <p className="mt-1 text-sand-100/80">{c.body}</p>
          </li>
        ))}
        {stats.recentComments.length === 0 && (
          <li className="text-sand-100/50">No comments yet.</li>
        )}
      </ul>
    </div>
  );
}
