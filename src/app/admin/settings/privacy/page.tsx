import { ShieldCheck } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { AnalyticsForm } from "@/components/analytics-form";
import { isAnalyticsProvider, resolveAnalytics } from "@/lib/telemetry-fields";
import { T } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.nav.privacy") };
export const dynamic = "force-dynamic";

// Everything this deployment does or doesn't send anywhere.
//
// Error reporting appears here as STATUS, not as a control. It is configured by
// environment variable and cannot be anything else: instrumentation.ts calls
// Sentry.init once per process at boot, so a value read from the database later
// could never reconfigure it. Showing it read-only is the honest option —
// leaving it out entirely would mean the one page about what leaves the server
// quietly omits the thing most likely to.
export default async function PrivacySettingsPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase!
    .from("site_settings")
    .select("analytics_provider")
    .eq("id", 1)
    .maybeSingle();

  const stored = (data as { analytics_provider?: string } | null)
    ?.analytics_provider;
  const serverErrors = Boolean(process.env.SENTRY_DSN);
  const browserErrors = Boolean(env.sentryDsnClient);

  return (
    <>
      <h2 className="font-display text-3xl font-semibold">
        <T k="admin.settings.nav.privacy" />
      </h2>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.settings.privacyIntro" />
      </p>

      <div className="mt-8">
        <AnalyticsForm
          initial={isAnalyticsProvider(stored) ? stored : ""}
          fromEnv={resolveAnalytics(null, env.analytics)}
          onVercel={env.onVercel}
        />
      </div>

      <section className="mt-8 rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-ember-400" />
          <h3 className="font-display text-xl font-semibold">
            <T k="admin.settings.errorsHeading" />
          </h3>
        </div>
        <p className="mt-2 text-sm text-sand-100/60">
          <T k="admin.settings.errorsIntro" />
        </p>
        <dl className="mt-5 space-y-2 text-sm">
          <StatusRow
            label={<T k="admin.settings.errorsServer" />}
            on={serverErrors}
            varName="SENTRY_DSN"
          />
          <StatusRow
            label={<T k="admin.settings.errorsBrowser" />}
            on={browserErrors}
            varName="NEXT_PUBLIC_SENTRY_DSN"
          />
        </dl>
      </section>
    </>
  );
}

function StatusRow({
  label,
  on,
  varName,
}: {
  label: React.ReactNode;
  on: boolean;
  varName: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2.5">
      <dt className="text-sand-100/80">{label}</dt>
      <dd className="flex items-center gap-2">
        <code className="font-mono text-xs text-sand-100/50">{varName}</code>
        <span
          className={
            on
              ? "rounded-full bg-sage-500/20 px-2.5 py-0.5 text-xs font-medium text-sage-300"
              : "rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-sand-100/60"
          }
        >
          <T k={on ? "admin.settings.errorsOn" : "admin.settings.errorsOff"} />
        </span>
      </dd>
    </div>
  );
}
