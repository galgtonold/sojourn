"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  REACTION_EMOJI,
  REACTION_KINDS,
  type ReactionKind,
  type ReactionSummary,
} from "@/lib/types";

const TOKEN_KEY = "sojourn:vid";

function visitorToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function Reactions({
  postId,
  initial,
}: {
  postId: string;
  initial: ReactionSummary;
}) {
  const [counts, setCounts] = useState<ReactionSummary>(initial);
  const [mine, setMine] = useState<Set<ReactionKind>>(new Set());
  const [busy, setBusy] = useState(false);
  // Set once the visitor toggles, so the mount refetch can't clobber their
  // optimistic update if it lands first.
  const touched = useRef(false);

  // Restore which reactions this visitor already gave.
  useEffect(() => {
    const stored = localStorage.getItem(`sojourn:react:${postId}`);
    if (stored) setMine(new Set(JSON.parse(stored) as ReactionKind[]));
  }, [postId]);

  // The page bakes counts at build time, so they drift between saves. Refetch the
  // live totals on mount (this block sits at the foot of the article, so it never
  // gates render). Ignore failures/demo mode — the baked `initial` stays put.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reactions?postId=${encodeURIComponent(postId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && !touched.current && data?.counts)
          setCounts(data.counts as ReactionSummary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function toggle(kind: ReactionKind) {
    if (busy) return;
    setBusy(true);
    touched.current = true;
    const active = mine.has(kind);

    // Optimistic update.
    const nextMine = new Set(mine);
    if (active) nextMine.delete(kind);
    else nextMine.add(kind);
    setMine(nextMine);
    setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] + (active ? -1 : 1)) }));
    localStorage.setItem(
      `sojourn:react:${postId}`,
      JSON.stringify([...nextMine]),
    );

    try {
      await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId,
          kind,
          token: visitorToken(),
          action: active ? "remove" : "add",
        }),
      });
    } catch {
      // Network/demo mode: keep the optimistic UI; it's non-critical.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {REACTION_KINDS.map((kind) => {
        const active = mine.has(kind);
        return (
          <motion.button
            key={kind}
            whileTap={{ scale: 0.85 }}
            onClick={() => toggle(kind)}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition ${
              active
                ? "border-ember-400 bg-ember-500/15 text-ember-300"
                : "border-white/10 bg-white/5 text-sand-100/80 hover:border-white/25"
            }`}
          >
            <span className="text-base leading-none">{REACTION_EMOJI[kind]}</span>
            <span className="tabular-nums">{counts[kind]}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
