"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles } from "lucide-react";
import { useT } from "@/components/i18n";

/**
 * Edits the blog-wide writing-style guide. "Propose from my posts" asks the
 * model to distil a starting draft from the author's published entries, which
 * they then edit and save. Saved guidance feeds every AI draft.
 */
export function WritingStyleForm({
  initial,
  aiConfigured,
}: {
  initial: string;
  aiConfigured: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writing_style: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "failed");
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    setProposing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/style-guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as {
        style?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "failed");
      if (j.style) {
        setValue(j.style);
        setSaved(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={12}
        placeholder={t("admin.settings.stylePlaceholder")}
        className="w-full resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-ember-400"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}{" "}
          {t("admin.editor.save")}
        </button>
        {aiConfigured && (
          <button
            onClick={propose}
            disabled={proposing}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm transition hover:border-ember-400 hover:text-ember-400 disabled:opacity-50"
          >
            {proposing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4 text-ember-400" />
            )}
            {t("admin.settings.propose")}
          </button>
        )}
        {saved && (
          <span className="text-sm text-sage-400">
            {t("admin.settings.saved")}
          </span>
        )}
      </div>
    </div>
  );
}
