"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Check, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import type { InteractionAnalytics } from "@/lib/db/interactions-admin";

type Sort = "recent" | "votes";

export function InteractionsAnalytics({
  items,
}: {
  items: InteractionAnalytics[];
}) {
  const t = useT();
  const [sort, setSort] = useState<Sort>("recent");
  const [article, setArticle] = useState<string>("all");

  // Distinct articles present, for the filter dropdown.
  const articles = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) if (it.postId) seen.set(it.postId, it.postTitle);
    return [...seen.entries()].map(([id, title]) => ({ id, title }));
  }, [items]);

  const shown = useMemo(() => {
    const list = (
      article === "all" ? items : items.filter((i) => i.postId === article)
    ).slice();
    list.sort((a, b) =>
      sort === "votes"
        ? b.total - a.total
        : a.createdAt < b.createdAt
          ? 1
          : -1,
    );
    return list;
  }, [items, article, sort]);

  const summary = useMemo(
    () => ({
      polls: items.filter((i) => i.kind === "poll").length,
      quizzes: items.filter((i) => i.kind === "quiz").length,
      votes: items.reduce((a, i) => a + i.total, 0),
    }),
    [items],
  );

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-ink-900/40 px-4 py-10 text-center text-sm text-sand-100/50">
        {t("admin.interactions.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sand-100/60">
          {t("admin.interactions.summary", {
            polls: summary.polls,
            quizzes: summary.quizzes,
            votes: summary.votes,
          })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {articles.length > 1 && (
            <select
              value={article}
              onChange={(e) => setArticle(e.target.value)}
              className="max-w-52 truncate rounded-full border border-white/10 bg-ink-800 px-3 py-1.5 text-sm outline-none focus:border-ember-400"
            >
              <option value="all">{t("admin.interactions.allArticles")}</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 p-0.5 text-xs">
            {(["recent", "votes"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={cn(
                  "rounded-full px-3 py-1 transition",
                  sort === s
                    ? "bg-white/10 text-sand-50"
                    : "text-sand-100/60 hover:text-sand-100",
                )}
              >
                {t(
                  s === "recent"
                    ? "admin.interactions.sortRecent"
                    : "admin.interactions.sortVotes",
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {shown.map((it) => (
          <InteractionCard key={it.id} it={it} />
        ))}
      </div>
    </div>
  );
}

function InteractionCard({ it }: { it: InteractionAnalytics }) {
  const t = useT();
  const isQuiz = it.kind === "quiz";
  const correctPct =
    isQuiz && it.correctIndex != null && it.total > 0
      ? Math.round(((it.counts[it.correctIndex] ?? 0) / it.total) * 100)
      : null;

  return (
    <div className="rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 uppercase tracking-wide",
            isQuiz
              ? "bg-sage-500/15 text-sage-300"
              : "bg-ember-500/15 text-ember-300",
          )}
        >
          {isQuiz ? (
            <BarChart3 className="size-3" />
          ) : (
            <MessageCircle className="size-3" />
          )}
          {isQuiz ? t("quiz.label") : t("poll.label")}
        </span>
        {it.postId ? (
          <Link
            href={`/admin/posts/${it.postId}`}
            className="min-w-0 truncate text-sand-100/60 transition hover:text-ember-400"
          >
            {it.postTitle}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sand-100/50">{it.postTitle}</span>
        )}
        <span className="ml-auto shrink-0 text-sand-100/50">
          {it.total > 0
            ? t("admin.interactions.votes", { n: it.total })
            : t("admin.interactions.noVotes")}
        </span>
      </div>

      <p className="mb-3 font-medium text-sand-50">{it.question}</p>

      <div className="space-y-1.5">
        {it.options.map((opt, i) => {
          const n = it.counts[i] ?? 0;
          const pct = it.total > 0 ? Math.round((n / it.total) * 100) : 0;
          const correct = isQuiz && it.correctIndex === i;
          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-lg bg-ink-800"
              title={correct ? t("admin.interactions.correct") : undefined}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all",
                  correct ? "bg-sage-500/25" : "bg-white/[0.06]",
                )}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center gap-2 px-3 py-1.5 text-sm">
                {correct && <Check className="size-3.5 shrink-0 text-sage-400" />}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    correct ? "text-sage-200" : "text-sand-100/80",
                  )}
                >
                  {opt}
                </span>
                <span className="shrink-0 tabular-nums text-sand-100/50">
                  {n} · {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {correctPct != null && (
        <p className="mt-2 text-xs text-sage-300/80">
          {t("admin.interactions.correctRate", { pct: correctPct })}
        </p>
      )}
    </div>
  );
}
