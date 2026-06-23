"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageSquare, Send } from "lucide-react";
import type { Comment } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useT, useI18n } from "@/components/i18n";

const NAME_KEY = "sojourn:name";
const VID_KEY = "sojourn:vid";
const LIKED_KEY = "sojourn:liked-comments";

function visitorToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(VID_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(VID_KEY, t);
  }
  return t;
}

export function Comments({
  postId,
  initial,
}: {
  postId: string;
  initial: Comment[];
}) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [total, setTotal] = useState(initial.length);
  const [name, setName] = useState("");
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limitRef = useRef(200);
  const { t, locale } = useI18n();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?postId=${encodeURIComponent(postId)}&limit=${limitRef.current}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { comments?: Comment[]; total?: number };
      if (Array.isArray(json.comments)) setComments(json.comments);
      if (typeof json.total === "number") setTotal(json.total);
    } catch {
      // keep what we have
    }
  }, [postId]);

  function loadEarlier() {
    limitRef.current += 200;
    refresh();
  }

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? "");
    const stored = localStorage.getItem(LIKED_KEY);
    if (stored) setLiked(new Set(JSON.parse(stored) as string[]));
    refresh();
  }, [refresh]);

  function setAndPersistName(n: string) {
    setName(n);
    localStorage.setItem(NAME_KEY, n);
  }

  async function submit(body: string, parentId: string | null) {
    const text = body.trim();
    if (!text) return;
    const author = name.trim() || t("comments.anonymous");

    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      post_id: postId,
      parent_id: parentId,
      author_name: author,
      body: text,
      created_at: new Date().toISOString(),
      like_count: 0,
    };
    setComments((c) => [...c, optimistic]);
    setReplyTo(null);
    setError(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, parentId, authorName: author, body: text }),
      });
      if (!res.ok) throw new Error("failed");
      refresh();
    } catch {
      // The post failed — drop the optimistic copy so we don't claim it saved,
      // and tell the reader so they can retry.
      setComments((c) => c.filter((x) => x.id !== optimistic.id));
      setError(t("comments.error"));
    }
  }

  async function toggleLike(id: string) {
    if (id.startsWith("temp-")) return;
    const isLiked = liked.has(id);
    const next = new Set(liked);
    if (isLiked) next.delete(id);
    else next.add(id);
    setLiked(next);
    localStorage.setItem(LIKED_KEY, JSON.stringify([...next]));
    setComments((cs) =>
      cs.map((c) =>
        c.id === id
          ? { ...c, like_count: Math.max(0, c.like_count + (isLiked ? -1 : 1)) }
          : c,
      ),
    );
    try {
      await fetch("/api/comments/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commentId: id,
          token: visitorToken(),
          action: isLiked ? "remove" : "add",
        }),
      });
    } catch {
      // optimistic only
    }
  }

  const childrenOf = useMemo(() => {
    // Promote orphans (whose parent isn't in the loaded window) to top level so
    // nothing is hidden when comments are paginated.
    const ids = new Set(comments.map((c) => c.id));
    const map = new Map<string | null, Comment[]>();
    for (const c of comments) {
      const k = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  }, [comments]);

  function renderNode(c: Comment, depth: number) {
    const kids = childrenOf.get(c.id) ?? [];
    const isLiked = liked.has(c.id);
    return (
      <li key={c.id} className={depth > 0 ? "mt-3" : ""}>
        <div className="rounded-2xl bg-ink-800 p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sand-50">{c.author_name}</span>
            <span className="text-xs text-sand-100/40">
              {formatDate(c.created_at, locale)}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sand-100/80">{c.body}</p>

          <div className="mt-2.5 flex items-center gap-4 text-xs">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => toggleLike(c.id)}
              aria-label={t("comments.like")}
              aria-pressed={isLiked}
              className={cn(
                "inline-flex items-center gap-1.5 transition",
                isLiked
                  ? "text-ember-400"
                  : "text-sand-100/50 hover:text-sand-100",
              )}
            >
              <Heart className={cn("size-3.5", isLiked && "fill-current")} />
              {c.like_count > 0 && (
                <span className="tabular-nums">{c.like_count}</span>
              )}
            </motion.button>
            <button
              onClick={() => setReplyTo((r) => (r === c.id ? null : c.id))}
              className="inline-flex items-center gap-1.5 text-sand-100/50 transition hover:text-sand-100"
            >
              <MessageSquare className="size-3.5" /> {t("comments.reply")}
            </button>
          </div>
        </div>

        {replyTo === c.id && (
          <div className="ml-4 mt-2 sm:ml-6">
            <CommentForm
              name={name}
              onName={setAndPersistName}
              onSubmit={(body) => submit(body, c.id)}
              onCancel={() => setReplyTo(null)}
              compact
              placeholder={t("comments.replyTo", { name: c.author_name })}
            />
          </div>
        )}

        {kids.length > 0 && (
          <ul
            className={cn(
              depth < 4 && "ml-4 border-l border-white/5 pl-3 sm:ml-6 sm:pl-4",
            )}
          >
            {kids.map((k) => renderNode(k, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="space-y-6">
      <h3 className="font-display text-2xl font-semibold">
        {t("comments.title")}
        <span className="ml-2 text-base font-normal text-sand-100/40">
          {total}
        </span>
      </h3>

      {comments.length < total && (
        <button
          onClick={loadEarlier}
          className="text-sm text-ember-400 hover:underline"
        >
          {t("comments.loadEarlier", { n: total - comments.length })}
        </button>
      )}

      {roots.length === 0 ? (
        <p className="text-sand-100/50">{t("comments.beFirst")}</p>
      ) : (
        <ul className="space-y-4">{roots.map((c) => renderNode(c, 0))}</ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <CommentForm
        name={name}
        onName={setAndPersistName}
        onSubmit={(body) => submit(body, null)}
        placeholder={t("comments.note")}
      />
    </div>
  );
}

function CommentForm({
  name,
  onName,
  onSubmit,
  onCancel,
  compact = false,
  placeholder,
}: {
  name: string;
  onName: (n: string) => void;
  onSubmit: (body: string) => Promise<void> | void;
  onCancel?: () => void;
  compact?: boolean;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const t = useT();

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    await onSubmit(body);
    setBody("");
    setSending(false);
  }

  return (
    <form
      onSubmit={go}
      className={cn(
        "space-y-3 rounded-2xl bg-ink-900 p-4",
        compact && "p-3",
      )}
    >
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder={t("comments.name")}
        maxLength={60}
        className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-ember-400"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder ?? t("comments.note")}
        required
        maxLength={4000}
        rows={compact ? 2 : 3}
        autoFocus={compact}
        className="w-full resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-ember-400"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          <Send className="size-4" />
          {sending
            ? t("comments.posting")
            : compact
              ? t("comments.send")
              : t("comments.post")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3 py-2 text-sm text-sand-100/60 hover:text-sand-100"
          >
            {t("comments.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
