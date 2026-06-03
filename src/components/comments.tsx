"use client";
import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import type { Comment } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/env";

export function Comments({
  postId,
  initial,
}: {
  postId: string;
  initial: Comment[];
}) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  // Pull the live list on mount so we never show a stale, page-cached (ISR)
  // snapshot. No-op in demo mode (there's no backend to read from).
  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const res = await fetch(
        `/api/comments?postId=${encodeURIComponent(postId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { comments?: Comment[] };
      if (Array.isArray(json.comments)) setComments(json.comments);
    } catch {
      // keep whatever we have
    }
  }, [postId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setStatus("sending");

    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      post_id: postId,
      parent_id: null,
      author_name: name.trim() || "Anonymous",
      body: body.trim(),
      created_at: new Date().toISOString(),
    };

    // Show it instantly.
    setComments((c) => [...c, optimistic]);
    setBody("");

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId,
          authorName: optimistic.author_name,
          body: optimistic.body,
        }),
      });
      if (!res.ok && res.status !== 202) throw new Error("failed");
      setStatus("idle");
      // Reconcile with the canonical server list (replaces the temp row).
      refresh();
    } catch {
      // Network/server error: surface it but keep their text visible.
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-display text-2xl font-semibold">
        Comments
        <span className="ml-2 text-base font-normal text-sand-100/40">
          {comments.length}
        </span>
      </h3>

      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="rounded-2xl bg-ink-800 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sand-50">{c.author_name}</span>
              <span className="text-xs text-sand-100/40">
                {formatDate(c.created_at)}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sand-100/80">
              {c.body}
            </p>
          </li>
        ))}
        {comments.length === 0 && (
          <li className="text-sand-100/50">Be the first to say something.</li>
        )}
      </ul>

      <form onSubmit={submit} className="space-y-3 rounded-2xl bg-ink-900 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={60}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-ember-400"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a note…"
          required
          maxLength={4000}
          rows={3}
          className="w-full resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-ember-400"
        />
        {status === "error" && (
          <p className="text-sm text-red-400">
            Couldn’t post that — please try again.
          </p>
        )}
        <button
          type="submit"
          disabled={status === "sending" || !body.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          <Send className="size-4" />
          {status === "sending" ? "Posting…" : "Post comment"}
        </button>
      </form>
    </div>
  );
}
