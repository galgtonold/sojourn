"use client";
import { Eye, Loader2, Save, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

export function PostActionBar({
  previewHref,
  saving,
  onSave,
  published,
  canPublish,
  onTogglePublish,
  statusLabel,
}: {
  previewHref: string;
  saving: boolean;
  onSave: () => void;
  published: boolean;
  canPublish: boolean;
  onTogglePublish: () => void;
  statusLabel: string;
}) {
  const t = useT();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/90 px-3 py-2 backdrop-blur lg:inset-x-auto lg:bottom-6 lg:left-auto lg:right-6 lg:rounded-full lg:border lg:px-3 lg:py-2 lg:shadow-2xl lg:ring-1 lg:ring-white/10">
      <div className="mx-auto flex max-w-5xl items-center gap-1.5 lg:max-w-none">
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          aria-label={t("admin.preview")}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1.5 text-sm text-sand-100/80 transition hover:border-white/25"
        >
          <Eye className="size-4" />
          <span className="hidden sm:inline">{t("admin.preview")}</span>
        </a>
        <span className="ml-auto hidden text-xs text-sand-100/45 sm:block">{statusLabel}</span>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-sm transition hover:border-ember-400 disabled:opacity-50 sm:ml-0"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? t("admin.editor.bar.saving") : t("admin.editor.bar.save")}
        </button>
        <button
          type="button"
          onClick={onTogglePublish}
          disabled={saving || (!published && !canPublish)}
          title={
            !published && !canPublish
              ? t("admin.editor.publishNeedsFields")
              : undefined
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-50",
            published
              ? "border border-white/15 text-sand-100/80 hover:border-white/25"
              : "bg-ember-500 text-ink-950 hover:bg-ember-400",
          )}
        >
          <Send className="size-4" />
          {published ? t("admin.editor.bar.unpublish") : t("admin.editor.bar.publish")}
        </button>
      </div>
    </div>
  );
}
