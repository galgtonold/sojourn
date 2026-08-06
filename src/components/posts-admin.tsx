"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";
import { Select } from "@/components/select";
import { formatDate, optimizedSrc } from "@/lib/utils";

export type AdminPostRow = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  published_at: string | null;
  created_at: string | null;
  trip_id: string | null;
  cover_image: string | null;
};

type Filter = "all" | "published" | "draft";

/** Searchable, filterable post-management list with inline delete. */
export function PostsAdmin({
  initial,
  trips,
}: {
  initial: AdminPostRow[];
  trips: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [posts, setPosts] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tripFilter, setTripFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  // Only offer trips that actually have posts in this list.
  const tripOptions = useMemo(
    () =>
      Object.entries(trips).filter(([id]) =>
        posts.some((p) => p.trip_id === id),
      ),
    [posts, trips],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (filter !== "all" && (filter === "published") !== p.published)
        return false;
      if (tripFilter !== "all" && p.trip_id !== tripFilter) return false;
      if (!needle) return true;
      const trip = p.trip_id ? (trips[p.trip_id] ?? "") : "";
      return (
        p.title.toLowerCase().includes(needle) ||
        trip.toLowerCase().includes(needle)
      );
    });
  }, [posts, q, filter, tripFilter, trips]);

  async function del(p: AdminPostRow) {
    const ok = await confirm({
      title: t("admin.posts.deleteTitle"),
      message: t("admin.posts.deleteConfirm", { title: p.title }),
      danger: true,
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/admin/posts/${p.id}`, { method: "DELETE" });
      if (res.ok) setPosts((ps) => ps.filter((x) => x.id !== p.id));
    } finally {
      setBusy(null);
    }
  }

  const filters: Filter[] = ["all", "published", "draft"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sand-100/60" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.posts.search")}
            className="w-full rounded-full border border-white/10 bg-ink-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-ember-400"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tripOptions.length > 0 && (
            <Select
              value={tripFilter}
              onChange={(e) => setTripFilter(e.target.value)}
              aria-label={t("admin.posts.allTrips")}
              className="rounded-full border border-white/10 bg-ink-900 px-3 py-1.5 text-xs text-sand-100/80 outline-none focus:border-ember-400"
            >
              <option value="all">{t("admin.posts.allTrips")}</option>
              {tripOptions.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </Select>
          )}
          <div className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5 text-xs">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 transition ${
                  filter === f
                    ? "bg-white/10 text-sand-50"
                    : "text-sand-100/50 hover:text-sand-100/80"
                }`}
              >
                {t(`admin.posts.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
        {shown.map((p) => {
          const tripTitle = p.trip_id ? trips[p.trip_id] : null;
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
            >
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-800 ring-1 ring-white/5">
                {p.cover_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={optimizedSrc(p.cover_image, 96, 60)}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/posts/${p.id}`}
                  className="block truncate font-medium hover:text-ember-300"
                >
                  {/* An untitled draft used to render an empty line: three of
                      them in a row were indistinguishable, and telling them
                      apart cost a click each. The date below does the
                      disambiguating; deliberately not the body's first line,
                      which would drag every draft's article into this list. */}
                  {p.title || (
                    <span className="italic text-sand-100/60">
                      {t("admin.posts.untitled")}
                    </span>
                  )}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-sand-100/60">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      p.published
                        ? "bg-sage-500/15 text-sage-400"
                        : "bg-white/10 text-sand-100/60"
                    }`}
                  >
                    {p.published ? t("admin.published") : t("admin.draft")}
                  </span>
                  {tripTitle && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="size-3 shrink-0 text-ember-400/70" />
                      {tripTitle}
                    </span>
                  )}
                  {p.published_at ? (
                    <span className="hidden sm:inline">
                      {formatDate(p.published_at, locale)}
                    </span>
                  ) : (
                    p.created_at && (
                      <span className="hidden sm:inline">
                        {t("admin.posts.createdOn")}{" "}
                        {formatDate(p.created_at, locale)}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/admin/posts/${p.id}/preview`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("admin.preview")}
                  title={t("admin.preview")}
                  className="grid size-9 place-items-center rounded-full text-sand-100/60 transition hover:bg-white/5 hover:text-sand-50"
                >
                  <Eye className="size-4" />
                </a>
                <Link
                  href={`/admin/posts/${p.id}`}
                  aria-label={t("admin.edit")}
                  title={t("admin.edit")}
                  className="grid size-9 place-items-center rounded-full text-ember-400 transition hover:bg-white/5"
                >
                  <Pencil className="size-4" />
                </Link>
                <button
                  onClick={() => del(p)}
                  disabled={busy === p.id}
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                  className="grid size-9 place-items-center rounded-full text-red-400/80 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  {busy === p.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sand-100/50">
            {posts.length === 0 ? t("admin.noPosts") : t("admin.posts.noMatch")}
            {posts.length === 0 && (
              <Link
                href="/admin/posts/new"
                className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
              >
                <Plus className="size-4" /> {t("admin.newPost")}
              </Link>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
