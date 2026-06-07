import Link from "next/link";
import {
  FileText,
  Gauge,
  KeyRound,
  MapPin,
  MessageSquare,
  Plus,
  Users,
} from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured, isAiConfigured } from "@/lib/env";
import { getPublishedPosts, getTrips } from "@/lib/content";
import { getViewer, type Viewer } from "@/lib/auth";
import { PushToggle } from "@/components/push-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { T } from "@/components/i18n";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

async function loadStats(viewer: Viewer) {
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

  const owner = viewer.isOwner;
  // A member is bounded to their granted trips; a sentinel keeps `.in()` valid
  // when they have none yet.
  const scope = owner
    ? null
    : viewer.tripIds.length
      ? viewer.tripIds
      : ["00000000-0000-0000-0000-000000000000"];

  let postsQuery = supabase
    .from("posts")
    .select("id, title, slug, published")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (scope) postsQuery = postsQuery.in("trip_id", scope);

  let postCountQuery = supabase
    .from("posts")
    .select("*", { count: "exact", head: true });
  if (scope) postCountQuery = postCountQuery.in("trip_id", scope);

  const [{ data: posts }, { count: postCount }] = await Promise.all([
    postsQuery,
    postCountQuery,
  ]);

  const postIds = (posts ?? []).map((p) => p.id);

  // Comments: all for the owner, otherwise only on the member's posts.
  let recentComments: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
  }[] = [];
  let commentCount = 0;
  if (owner) {
    const [c, { count }] = await Promise.all([
      supabase
        .from("comments")
        .select("id, author_name, body, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("comments").select("*", { count: "exact", head: true }),
    ]);
    recentComments = c.data ?? [];
    commentCount = count ?? 0;
  } else if (postIds.length) {
    const [c, { count }] = await Promise.all([
      supabase
        .from("comments")
        .select("id, author_name, body, created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .in("post_id", postIds),
    ]);
    recentComments = c.data ?? [];
    commentCount = count ?? 0;
  }

  return {
    email: viewer.email,
    postCount: postCount ?? 0,
    commentCount,
    recentComments,
    posts: posts ?? [],
  };
}

export default async function AdminDashboard() {
  const viewer = await getViewer();
  const stats = await loadStats(viewer);
  const allTrips = await getTrips();
  const trips = viewer.isOwner
    ? allTrips
    : allTrips.filter((t) => viewer.tripIds.includes(t.id));

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-28">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">
            <T k="admin.dashboard" />
          </h1>
          {stats.email && (
            <p className="mt-1 text-sm text-sand-100/50">
              <T k="admin.signedInAs" vars={{ email: stats.email }} />
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {viewer.isOwner && <PushToggle />}
          {viewer.isOwner && isSupabaseConfigured && (
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
            >
              <Users className="size-4" /> <T k="admin.members.link" />
            </Link>
          )}
          {viewer.isOwner && isAiConfigured && (
            <Link
              href="/admin/ai-usage"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
            >
              <Gauge className="size-4" /> <T k="admin.usage.link" />
            </Link>
          )}
          {isSupabaseConfigured && (
            <Link
              href="/admin/account"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
            >
              <KeyRound className="size-4" /> <T k="admin.password" />
            </Link>
          )}
          {isSupabaseConfigured && <SignOutButton />}
        </div>
      </div>

      {!isSupabaseConfigured && (
        <p className="mt-6 rounded-2xl bg-ember-600/15 p-4 text-sm text-ember-300">
          <T k="admin.demoNotice" />
        </p>
      )}

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
          <FileText className="size-5 text-ember-400" />
          <p className="mt-3 font-display text-3xl font-semibold">
            {stats.postCount}
          </p>
          <p className="text-sm text-sand-100/50">
            <T k="admin.statPosts" />
          </p>
        </div>
        <div className="rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
          <MessageSquare className="size-5 text-lagoon-400" />
          <p className="mt-3 font-display text-3xl font-semibold">
            {stats.commentCount}
          </p>
          <p className="text-sm text-sand-100/50">
            <T k="admin.statComments" />
          </p>
        </div>
      </div>

      {/* Posts */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">
          <T k="admin.postsHeading" />
        </h2>
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          <Plus className="size-4" /> <T k="admin.newPost" />
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
                {p.published ? <T k="admin.published" /> : <T k="admin.draft" />}
              </span>
              <a
                href={`/admin/posts/${p.id}/preview`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-sand-100/60 hover:underline"
              >
                <T k="admin.preview" />
              </a>
              <Link
                href={`/admin/posts/${p.id}`}
                className="text-sm text-ember-400 hover:underline"
              >
                <T k="admin.edit" />
              </Link>
            </span>
          </li>
        ))}
        {stats.posts.length === 0 && (
          <li className="px-5 py-4 text-sand-100/50">
            <T k="admin.noPosts" />
          </li>
        )}
      </ul>

      {/* Trips */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">
          <T k="admin.trip.heading" />
        </h2>
        {viewer.isOwner && (
          <Link
            href="/admin/trips/new"
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
          >
            <Plus className="size-4" /> <T k="admin.trip.newTrip" />
          </Link>
        )}
      </div>
      <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
        {trips.map((tr) => (
          <li
            key={tr.id}
            className="flex items-center justify-between gap-3 px-5 py-3.5"
          >
            <span className="flex min-w-0 items-center gap-2 truncate">
              <MapPin className="size-4 shrink-0 text-ember-400" />
              <span className="truncate">{tr.title}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {tr.start_date && (
                <span className="hidden text-xs text-sand-100/40 sm:inline">
                  {formatDate(tr.start_date)}
                </span>
              )}
              <Link
                href={`/admin/trips/${tr.id}`}
                className="text-sm text-ember-400 hover:underline"
              >
                <T k="admin.edit" />
              </Link>
            </span>
          </li>
        ))}
        {trips.length === 0 && (
          <li className="px-5 py-4 text-sand-100/50">
            <T k="admin.trip.none" />
          </li>
        )}
      </ul>

      {/* Recent comments */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">
          <T k="admin.recentComments" />
        </h2>
        <Link
          href="/admin/comments"
          className="text-sm text-ember-400 hover:underline"
        >
          <T k="admin.moderateAll" />
        </Link>
      </div>
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
          <li className="text-sand-100/50">
            <T k="admin.noComments" />
          </li>
        )}
      </ul>
    </div>
  );
}
