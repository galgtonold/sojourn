"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Languages, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/components/i18n";

type Status = "none" | "pending" | "ready" | "error";

/**
 * Shows the background-translation state for a post and lets the author force a
 * re-translation. Polls while a translation is in flight so "Translating…"
 * flips to "Translated" without a manual refresh. When a translation failed, the
 * captured reason is shown (hover) instead of a bare "error".
 */
export function TranslationBadge({
  postId,
  initialStatus,
  published,
}: {
  postId: string;
  initialStatus: Status;
  published: boolean;
}) {
  const t = useT();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetch the failure reason once when we land on an errored post.
  useEffect(() => {
    if (initialStatus !== "error") return;
    let active = true;
    fetch(`/api/admin/posts/${postId}/translate`)
      .then((r) => r.json())
      .then((j: { error?: string | null }) => active && setReason(j.error ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [initialStatus, postId]);

  useEffect(() => {
    if (status !== "pending") return;
    let active = true;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/posts/${postId}/translate`);
        const j = (await r.json()) as { status?: Status; error?: string | null };
        if (!active) return;
        if (j.status) setStatus(j.status);
        setReason(j.error ?? null);
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [status, postId]);

  const retranslate = useCallback(async () => {
    setBusy(true);
    setReason(null);
    try {
      const r = await fetch(`/api/admin/posts/${postId}/translate`, {
        method: "POST",
      });
      const j = (await r.json()) as { status?: Status };
      setStatus(j.status ?? "pending");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [postId]);

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <Languages className="size-4 shrink-0 text-sand-100/40" />
      {!published ? (
        <span className="text-sand-100/60">{t("admin.translation.onPublish")}</span>
      ) : (
        <>
          {status === "pending" && (
            <span className="inline-flex items-center gap-1.5 text-sand-100/70">
              <Loader2 className="size-3.5 animate-spin" />
              {t("admin.translation.pending")}
            </span>
          )}
          {status === "ready" && (
            <span className="inline-flex items-center gap-1.5 text-sage-400">
              <Check className="size-3.5" />
              {t("admin.translation.ready")}
            </span>
          )}
          {status === "error" && (
            <span
              className="inline-flex min-w-0 items-center gap-1.5 text-red-400"
              title={reason ?? undefined}
            >
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="shrink-0">{t("admin.translation.error")}</span>
              {reason && (
                <span className="truncate text-red-400/70">— {reason}</span>
              )}
            </span>
          )}
          {status === "none" && (
            <span className="text-sand-100/60">{t("admin.translation.none")}</span>
          )}
          <button
            onClick={retranslate}
            disabled={busy || status === "pending"}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-sand-100/70 transition hover:border-ember-400 hover:text-ember-400 disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
            {t("admin.translation.retranslate")}
          </button>
        </>
      )}
    </div>
  );
}
