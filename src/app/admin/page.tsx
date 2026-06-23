import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Gauge,
  KeyRound,
  MapPin,
  MessageSquare,
  PenLine,
  Plus,
  Users,
} from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { getPublishedPosts, getTrips } from "@/lib/content";
import { getViewer, type Viewer } from "@/lib/auth";
import { PushToggle } from "@/components/push-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { getReaderLocale } from "@/lib/i18n-server";

export const metadata = { title: defaultTitle("meta.admin") };
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
    };
  }

  const owner = viewer.isOwner;
  const scope = owner
    ? null
    : viewer.tripIds.length
      ? viewer.tripIds
      : ["00000000-0000-0000-0000-000000000000"];

  let postCountQuery = supabase
    .from("posts")
    .select("*", { count: "exact", head: true });
  if (scope) postCountQuery = postCountQuery.in("trip_id", scope);
  const { count: postCount } = await postCountQuery;

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
        .limit(6),
      supabase.from("comments").select("*", { count: "exact", head: true }),
    ]);
    recentComments = c.data ?? [];
    commentCount = count ?? 0;
  } else {
    const { data: myPosts } = await supabase
      .from("posts")
      .select("id")
      .in("trip_id", scope ?? []);
    const postIds = (myPosts ?? []).map((p) => p.id);
    if (postIds.length) {
      const [c, { count }] = await Promise.all([
        supabase
          .from("comments")
          .select("id, author_name, body, created_at")
          .in("post_id", postIds)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("comments")
          .select("*", { count: "exact", head: true })
          .in("post_id", postIds),
      ]);
      recentComments = c.data ?? [];
      commentCount = count ?? 0;
    }
  }

  return {
    email: viewer.email,
    postCount: postCount ?? 0,
    commentCount,
    recentComments,
  };
}

export default async function AdminDashboard() {
  const viewer = await getViewer();
  const locale = await getReaderLocale();
  const stats = await loadStats(viewer);
  const allTrips = await getTrips();
  const trips = viewer.isOwner
    ? allTrips
    : allTrips.filter((t) => viewer.tripIds.includes(t.id));

  const navCard =
    "group flex items-center gap-4 rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5 transition hover:ring-white/15";

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-28">
      <DocumentTitle k="meta.admin" />
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
        <div className="flex flex-wrap items-center gap-2">
          <PushToggle />
          <Link
            href="/admin/account"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
          >
            <KeyRound className="size-4" /> <T k="admin.password" />
          </Link>
          <SignOutButton />
        </div>
      </div>

      {/* Primary actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/posts/new"
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
        >
          <Plus className="size-4" /> <T k="admin.newPost" />
        </Link>
        {viewer.isOwner && (
          <Link
            href="/admin/trips/new"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-ember-400 hover:text-ember-400"
          >
            <Plus className="size-4" /> <T k="admin.trip.newTrip" />
          </Link>
        )}
      </div>

      {/* Section navigation — each card doubles as an at-a-glance stat. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/posts" className={navCard}>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-ember-500/15 text-ember-400">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-semibold leading-none">
              {stats.postCount}
            </p>
            <p className="mt-1 text-sm text-sand-100/60">
              <T k="admin.statPosts" />
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-sand-100/30 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
        </Link>

        <Link href="/admin/comments" className={navCard}>
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-sage-500/15 text-sage-400">
            <MessageSquare className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-semibold leading-none">
              {stats.commentCount}
            </p>
            <p className="mt-1 text-sm text-sand-100/60">
              <T k="admin.statComments" />
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-sand-100/30 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
        </Link>

        {viewer.isOwner && (
          <Link href="/admin/members" className={navCard}>
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 text-sand-100/70">
              <Users className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold leading-tight">
                <T k="admin.members.link" />
              </p>
              <p className="mt-0.5 text-sm text-sand-100/50">
                <T k="admin.nav.membersSub" />
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-sand-100/30 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
          </Link>
        )}

        {viewer.isOwner && isAiConfigured && (
          <Link href="/admin/ai-usage" className={navCard}>
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 text-sand-100/70">
              <Gauge className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold leading-tight">
                <T k="admin.usage.link" />
              </p>
              <p className="mt-0.5 text-sm text-sand-100/50">
                <T k="admin.nav.usageSub" />
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-sand-100/30 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
          </Link>
        )}

        {viewer.isOwner && (
          <Link href="/admin/settings" className={navCard}>
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 text-sand-100/70">
              <PenLine className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold leading-tight">
                <T k="admin.settings.link" />
              </p>
              <p className="mt-0.5 text-sm text-sand-100/50">
                <T k="admin.nav.settingsSub" />
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-sand-100/30 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
          </Link>
        )}
      </div>

      {/* Trips */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold">
          <T k="admin.trip.heading" />
        </h2>
        {viewer.isOwner && (
          <Link
            href="/admin/trips/new"
            className="inline-flex items-center gap-1.5 text-sm text-ember-400 hover:underline"
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
                <span className="hidden text-xs text-sand-100/60 sm:inline">
                  {formatDate(tr.start_date, locale)}
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
          <li
            key={c.id}
            className="rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{c.author_name}</span>
              <span className="text-sand-100/60">
                {formatDate(c.created_at, locale)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sand-100/80">{c.body}</p>
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
