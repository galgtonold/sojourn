"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

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

  async function toggleHide(row: ModerationRow) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const hidden = !row.hidden;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, hidden } : r)));
    await supabase.from("comments").update({ hidden }).eq("id", row.id);
  }

  async function del(row: ModerationRow) {
    if (!confirm("Delete this comment (and its replies) permanently?")) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    await supabase.from("comments").delete().eq("id", row.id);
  }

  if (rows.length === 0) {
    return <p className="text-sand-100/50">No comments yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className={`rounded-2xl p-4 ring-1 ring-white/5 ${
            row.hidden ? "bg-ink-900/60 opacity-60" : "bg-ink-900"
          }`}
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {row.author_name}
              {row.parent_id && (
                <span className="ml-2 text-xs text-sand-100/40">reply</span>
              )}
              {row.hidden && (
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-sand-100/60">
                  hidden
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-sand-100/40">
              {formatDate(row.created_at)}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sand-100/80">
            {row.body}
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs">
            <Link
              href={`/posts/${row.post_slug}`}
              className="text-sand-100/50 hover:text-ember-400"
            >
              on “{row.post_title}”
            </Link>
            <button
              onClick={() => toggleHide(row)}
              className="inline-flex items-center gap-1.5 text-sand-100/60 transition hover:text-sand-50"
            >
              {row.hidden ? (
                <>
                  <Eye className="size-3.5" /> Unhide
                </>
              ) : (
                <>
                  <EyeOff className="size-3.5" /> Hide
                </>
              )}
            </button>
            <button
              onClick={() => del(row)}
              className="inline-flex items-center gap-1.5 text-red-400/80 transition hover:text-red-400"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
