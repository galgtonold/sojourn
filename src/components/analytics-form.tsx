"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";
import {
  ANALYTICS_PROVIDERS,
  type AnalyticsProvider,
} from "@/lib/telemetry-fields";

/**
 * The one piece of telemetry an owner might actually want, and the only one
 * they can set without a redeploy.
 *
 * `fromEnv` is what NEXT_PUBLIC_ANALYTICS says. It matters to show, because a
 * blank setting inherits it — so an owner who sees "on" here needs to know
 * whether that is their choice or the deployment's, and picking "off"
 * explicitly is what overrides it.
 */
export function AnalyticsForm({
  initial,
  fromEnv,
}: {
  initial: AnalyticsProvider | "";
  fromEnv: AnalyticsProvider;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<AnalyticsProvider>(
    initial || fromEnv || "none",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: AnalyticsProvider) {
    setValue(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analytics_provider: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(t("admin.settings.analyticsError"));
      return;
    }
    setSaved(true);
    // The layout reads this, so the change only shows after the server
    // re-renders with the busted cache.
    router.refresh();
  }

  const inheriting = !initial && fromEnv !== "none";

  return (
    <section className="rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5 text-ember-400" />
        <h2 className="font-display text-xl font-semibold">
          {t("admin.settings.analyticsHeading")}
        </h2>
      </div>
      <p className="mt-2 text-sm text-sand-100/60">
        {t("admin.settings.analyticsIntro")}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {ANALYTICS_PROVIDERS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => save(p)}
            aria-pressed={value === p}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50",
              value === p
                ? "bg-ember-500 text-ink-950"
                : "bg-white/5 text-sand-100/80 ring-1 ring-white/10 hover:bg-white/10",
            )}
          >
            {t(
              p === "none"
                ? "admin.settings.analyticsOff"
                : "admin.settings.analyticsVercel",
            )}
          </button>
        ))}
      </div>

      {value === "vercel" && (
        // The seam worth being honest about: this switch decides whether the
        // script loads, not whether Vercel records anything. Web Analytics is
        // enabled per project in Vercel's own dashboard, and without that step
        // an owner would turn this on, see no numbers, and have no idea why.
        <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-sand-100/60">
          {t("admin.settings.analyticsVercelNote")}
        </p>
      )}

      {inheriting && (
        <p className="mt-3 text-xs text-sand-100/50">
          {t("admin.settings.analyticsFromEnv")}
        </p>
      )}
      {saved && !error && (
        <p className="mt-3 text-xs text-sage-300">{t("admin.settings.saved")}</p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}
