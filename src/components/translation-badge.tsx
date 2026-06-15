"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/components/i18n";

type Status = "none" | "pending" | "ready" | "error";

/**
 * Shows the background-translation state for a post and lets the author force a
 * re-translation. Polls while a translation is in flight so "Translating…"
 * flips to "Translated" without a manual refresh.
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "pending") return;
    let active = true;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/posts/${postId}/translate`);
        const j = (await r.json()) as { status?: Status };
        if (active && j.status) setStatus(j.status);
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

  if (!published) {
    return (
      <span className="text-xs text-sand-100/40">
        {t("admin.translation.onPublish")}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {status === "pending" && (
        <span className="inline-flex items-center gap-1.5 text-sand-100/60">
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
        <span className="inline-flex items-center gap-1.5 text-red-400">
          <AlertTriangle className="size-3.5" />
          {t("admin.translation.error")}
        </span>
      )}
      {status === "none" && (
        <span className="text-sand-100/40">{t("admin.translation.none")}</span>
      )}
      <button
        onClick={retranslate}
        disabled={busy || status === "pending"}
        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-sand-100/70 transition hover:border-ember-400 hover:text-ember-400 disabled:opacity-50"
      >
        <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
        {t("admin.translation.retranslate")}
      </button>
    </div>
  );
}
