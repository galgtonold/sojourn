"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

export type ModerationRow = {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
  hidden: boolean;
  parent_id: string | null;
  post_title: string;
  post_slug: string;
};

export function CommentModeration({ initial }: { initial: ModerationRow[] }) {
  const [rows, setRows] = useState<ModerationRow[]>(initial);
  const t = useT();
  const confirm = useConfirm();

  async function toggleHide(row: ModerationRow) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const hidden = !row.hidden;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, hidden } : r)));
    await supabase.from("comments").update({ hidden }).eq("id", row.id);
  }

  async function del(row: ModerationRow) {
    if (!(await confirm({ message: t("admin.cmod.deleteConfirm"), danger: true, confirmLabel: t("common.delete") }))) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    // Remove the comment and any descendants locally (DB cascades the delete).
    const toRemove = new Set([row.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of rows) {
        if (r.parent_id && toRemove.has(r.parent_id) && !toRemove.has(r.id)) {
          toRemove.add(r.id);
          grew = true;
        }
      }
    }
    setRows((rs) => rs.filter((r) => !toRemove.has(r.id)));
    await supabase.from("comments").delete().eq("id", row.id);
  }

  // Group by post, then build a comment tree within each post.
  const groups = useMemo(() => {
    const byPost = new Map<
      string,
      { title: string; slug: string; rows: ModerationRow[] }
    >();
    for (const r of rows) {
      const g = byPost.get(r.post_slug) ?? {
        title: r.post_title,
        slug: r.post_slug,
        rows: [],
      };
      g.rows.push(r);
      byPost.set(r.post_slug, g);
    }
    // Most recently active posts first.
    return [...byPost.values()].sort(
      (a, b) =>
        latest(b.rows).localeCompare(latest(a.rows)),
    );
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sand-100/50">{t("admin.cmod.none")}</p>;
  }

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.slug}>
          <Link
            href={`/posts/${g.slug}`}
            className="font-display text-lg font-semibold text-sand-50 hover:text-ember-400"
          >
            {g.title}
          </Link>
          <span className="ml-2 text-xs text-sand-100/40">
            {g.rows.length === 1
              ? t("admin.cmod.comment", { n: g.rows.length })
              : t("admin.cmod.comments", { n: g.rows.length })}
          </span>
          <div className="mt-3">
            <Tree
              rows={g.rows}
              depth={0}
              parentId={null}
              onToggle={toggleHide}
              onDelete={del}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function latest(rows: ModerationRow[]): string {
  return rows.reduce((m, r) => (r.created_at > m ? r.created_at : m), "");
}

function Tree({
  rows,
  depth,
  parentId,
  onToggle,
  onDelete,
}: {
  rows: ModerationRow[];
  depth: number;
  parentId: string | null;
  onToggle: (r: ModerationRow) => void;
  onDelete: (r: ModerationRow) => void;
}) {
  const t = useT();
  const ids = new Set(rows.map((r) => r.id));
  const children = rows
    .filter((r) => {
      const effective = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null;
      return effective === parentId;
    })
    .sort((a, b) =>
      depth === 0
        ? b.created_at.localeCompare(a.created_at) // newest threads first
        : a.created_at.localeCompare(b.created_at), // replies oldest first
    );

  if (children.length === 0) return null;

  return (
    <ul
      className={
        depth > 0 && depth < 5
          ? "ml-3 border-l border-white/5 pl-3 sm:ml-4 sm:pl-4"
          : ""
      }
    >
      {children.map((r) => (
        <li key={r.id} className="mt-2 first:mt-0">
          <div
            className={`rounded-2xl p-3 ring-1 ring-white/5 ${
              r.hidden ? "bg-ink-900/50 opacity-60" : "bg-ink-900"
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">
                {r.author_name}
                {r.parent_id && (
                  <span className="ml-2 text-xs text-sand-100/40">
                    {t("admin.cmod.reply")}
                  </span>
                )}
                {r.hidden && (
                  <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-sand-100/60">
                    {t("admin.cmod.hidden")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-sand-100/40">
                {formatDate(r.created_at)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sand-100/80">{r.body}</p>
            <div className="mt-1.5 flex items-center gap-4 text-xs">
              <button
                onClick={() => onToggle(r)}
                className="inline-flex items-center gap-1.5 text-sand-100/60 transition hover:text-sand-50"
              >
                {r.hidden ? (
                  <>
                    <Eye className="size-3.5" /> {t("admin.cmod.unhide")}
                  </>
                ) : (
                  <>
                    <EyeOff className="size-3.5" /> {t("admin.cmod.hide")}
                  </>
                )}
              </button>
              <button
                onClick={() => onDelete(r)}
                className="inline-flex items-center gap-1.5 text-red-400/80 transition hover:text-red-400"
              >
                <Trash2 className="size-3.5" /> {t("admin.cmod.delete")}
              </button>
            </div>
          </div>
          <Tree
            rows={rows}
            depth={depth + 1}
            parentId={r.id}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        </li>
      ))}
    </ul>
  );
}
