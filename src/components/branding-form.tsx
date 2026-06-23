"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { useT } from "@/components/i18n";

/**
 * Edits the site's name and tagline. Saving busts the cached branding and
 * revalidates the layout server-side (see the settings route), so the change
 * shows across the site. Empty falls back to the built-in defaults.
 */
export function BrandingForm({
  initialName,
  initialTagline,
  initialHeroLead,
  initialHeroAccent,
  defaultName,
  defaultHeroLead,
  defaultHeroAccent,
}: {
  initialName: string;
  initialTagline: string;
  initialHeroLead: string;
  initialHeroAccent: string;
  /** Shown as placeholders when a field is left blank — the current defaults. */
  defaultName: string;
  defaultHeroLead: string;
  defaultHeroAccent: string;
}) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [tagline, setTagline] = useState(initialTagline);
  const [heroLead, setHeroLead] = useState(initialHeroLead);
  const [heroAccent, setHeroAccent] = useState(initialHeroAccent);
  const [busy, setBusy] = useState(false);
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
        body: JSON.stringify({
          site_name: name,
          tagline,
          hero_lead: heroLead,
          hero_accent: heroAccent,
        }),
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

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm text-sand-100/70">
          {t("admin.settings.brandName")}
        </span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder={defaultName}
          className={`${input} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="text-sm text-sand-100/70">
          {t("admin.settings.brandTagline")}
        </span>
        <input
          value={tagline}
          onChange={(e) => {
            setTagline(e.target.value);
            setSaved(false);
          }}
          placeholder={t("admin.settings.brandTaglinePlaceholder")}
          className={`${input} mt-1.5`}
        />
      </label>
      <div>
        <span className="text-sm text-sand-100/70">
          {t("admin.settings.brandHeadline")}
        </span>
        <p className="mt-0.5 text-xs text-sand-100/40">
          {t("admin.settings.brandHeadlineHint")}
        </p>
        <input
          value={heroLead}
          onChange={(e) => {
            setHeroLead(e.target.value);
            setSaved(false);
          }}
          placeholder={defaultHeroLead}
          aria-label={t("admin.settings.brandHeadline")}
          className={`${input} mt-1.5`}
        />
        <input
          value={heroAccent}
          onChange={(e) => {
            setHeroAccent(e.target.value);
            setSaved(false);
          }}
          placeholder={defaultHeroAccent}
          aria-label={t("admin.settings.brandHeadlineAccent")}
          className={`${input} mt-2 text-ember-300`}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
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
        {saved && (
          <span className="text-sm text-sage-400">
            {t("admin.settings.saved")}
          </span>
        )}
      </div>
    </div>
  );
}
