"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { useT } from "@/components/i18n";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { flattenBranding, type BrandValues } from "@/lib/branding-fields";
import { cn } from "@/lib/utils";

/**
 * Edits the site's name (single) and its per-language copy: the home hero intro
 * line, headline (lead + highlighted accent) and footer tagline. A live preview
 * shows the result; empty in a language falls back to the localized default.
 * Saving busts the branding cache + revalidates the layout (see settings route).
 */
export function BrandingForm({
  initialName,
  defaultName,
  initial,
  defaults,
}: {
  initialName: string;
  /** Shown as the name placeholder when blank — the current default. */
  defaultName: string;
  initial: BrandValues;
  /** Localized built-in copy, per language: placeholders + preview fallback. */
  defaults: BrandValues;
}) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [vals, setVals] = useState<BrandValues>(initial);
  const [lang, setLang] = useState<Locale>("de");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof BrandValues, value: string) {
    setVals((v) => ({ ...v, [field]: { ...v[field], [lang]: value } }));
    setSaved(false);
  }
  // The value to show in the preview: what's typed, else the localized default.
  const shown = (field: keyof BrandValues) =>
    vals[field][lang].trim() || defaults[field][lang];

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(flattenBranding(name, vals)),
      });
      if (!res.ok) throw new Error("failed");
      setSaved(true);
      router.refresh();
    } catch {
      setError(t("admin.err.save"));
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";
  const renderField = (key: keyof BrandValues, label: string) => (
    <label className="block">
      <span className="text-sm text-sand-100/70">{label}</span>
      <input
        value={vals[key][lang]}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={defaults[key][lang]}
        className={cn(input, "mt-1.5")}
      />
    </label>
  );

  return (
    <div className="space-y-5">
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
          className={cn(input, "mt-1.5")}
        />
      </label>

      {/* Language being edited. */}
      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
        <span className="text-sm text-sand-100/60">
          {t("admin.settings.brandLangNote")}
        </span>
        <div className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5 text-xs">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "rounded-full px-3 py-1 transition",
                lang === l ? "bg-white/10 text-sand-50" : "text-sand-100/50",
              )}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {renderField("kicker", t("admin.settings.brandKicker"))}
      <div>
        <span className="text-sm text-sand-100/70">
          {t("admin.settings.brandHeadline")}
        </span>
        <p className="mt-0.5 text-xs text-sand-100/60">
          {t("admin.settings.brandHeadlineHint")}
        </p>
        <input
          value={vals.heroLead[lang]}
          onChange={(e) => setField("heroLead", e.target.value)}
          placeholder={defaults.heroLead[lang]}
          aria-label={t("admin.settings.brandHeadline")}
          className={cn(input, "mt-1.5")}
        />
        <input
          value={vals.heroAccent[lang]}
          onChange={(e) => setField("heroAccent", e.target.value)}
          placeholder={defaults.heroAccent[lang]}
          aria-label={t("admin.settings.brandHeadlineAccent")}
          className={cn(input, "mt-2 text-ember-300")}
        />
      </div>
      {renderField("tagline", t("admin.settings.brandTagline"))}

      {/* Live preview of the hero + footer in the language being edited. */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-sand-100/60">
          {t("admin.settings.brandPreview")}
        </p>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-950 p-5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.25em] text-ember-300">
            {name.trim() || defaultName} — {shown("kicker")}
          </p>
          <p className="mt-1.5 max-w-md text-balance font-display text-2xl font-semibold leading-tight">
            {shown("heroLead")}{" "}
            <span className="text-gradient-ember">{shown("heroAccent")}</span>.
          </p>
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="font-display text-base">{name.trim() || defaultName}</p>
            <p className="mt-0.5 text-xs text-sand-100/50">{shown("tagline")}</p>
          </div>
        </div>
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
