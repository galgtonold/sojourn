import Link from "next/link";
import { Database, Package, TerminalSquare } from "lucide-react";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { SOJOURN_VERSION, isNewerRelease } from "@/lib/version";
import { detectHost, updateRecipe } from "@/lib/update-hosts";
import { latestRelease } from "@/lib/releases";
import { readSchemaReport, schemaNeedsAttention } from "@/lib/schema-status";
import type { SchemaReport } from "@/lib/schema-status";
import { UpdateCheckForm } from "@/components/update-check-form";
import { T } from "@/components/i18n";
import { defaultTitle, type DictKey } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.nav.updates") };
export const dynamic = "force-dynamic";

// What version this is, whether there is a newer one, how to get it *here*, and
// whether the database kept up.
//
// There is deliberately no button that updates anything. None of the three
// hosts can rebuild themselves, and the one that could — a bare-metal checkout
// — is the worst candidate for it: the updater should not be the thing being
// updated.
export default async function UpdatesSettingsPage() {
  const host = detectHost(process.env);
  const recipe = updateRecipe(host);
  const schema = await readSchemaReport();

  // Read defensively. This is the page that reports a schema behind the code,
  // so it is the one page that must still render when the schema is behind the
  // code — including when the column backing this very switch is the thing
  // missing. Unreadable reads as "on", which is the default the column carries.
  const admin = getAdminSupabase();
  const { data, error } = admin
    ? await admin
        .from("site_settings")
        .select("update_check")
        .eq("id", 1)
        .maybeSingle()
    : { data: null, error: null };
  const checkEnabled =
    error || !data ? true : (data as { update_check?: boolean }).update_check !== false;

  const release = checkEnabled ? await latestRelease() : null;
  const updateAvailable = release?.ok ? isNewerRelease(release.tag) : false;

  return (
    <>
      <h2 className="font-display text-3xl font-semibold">
        <T k="admin.settings.nav.updates" />
      </h2>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.updates.intro" />
      </p>

      {/* ── version ─────────────────────────────────────────────────────── */}
      <section className="mt-8 rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <Package className="size-5 text-ember-400" />
          <h3 className="font-display text-xl font-semibold">
            <T k="admin.updates.versionHeading" />
          </h3>
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          <Row label={<T k="admin.updates.running" />}>
            <code className="font-mono text-sand-50">{SOJOURN_VERSION}</code>
          </Row>
          <Row label={<T k="admin.updates.latest" />}>
            {!checkEnabled ? (
              <Pill tone="muted" k="admin.updates.checkDisabled" />
            ) : release?.ok ? (
              <span className="flex items-center gap-2">
                <code className="font-mono text-sand-50">{release.tag}</code>
                {updateAvailable ? (
                  <Pill tone="warn" k="admin.updates.newer" />
                ) : (
                  <Pill tone="ok" k="admin.updates.upToDate" />
                )}
              </span>
            ) : (
              <Pill tone="muted" k="admin.updates.unreachable" />
            )}
          </Row>
        </dl>

        {checkEnabled && release && !release.ok && (
          <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-sand-100/60">
            <T k="admin.updates.unreachableHint" />
          </p>
        )}

        {updateAvailable && release?.ok && (
          <Link
            href={release.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-5 inline-flex rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-ink-950 transition hover:bg-ember-400"
          >
            <T k="admin.updates.releaseNotes" />
          </Link>
        )}
      </section>

      {/* ── how to update, for this host only ───────────────────────────── */}
      <section className="mt-6 rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <TerminalSquare className="size-5 text-ember-400" />
          <h3 className="font-display text-xl font-semibold">
            <T k="admin.updates.howHeading" />
          </h3>
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-sand-100/70 ring-1 ring-white/10">
            <T k={recipe.label} />
          </span>
        </div>
        <p className="mt-2 text-sm text-sand-100/60">
          <T k={recipe.intro} />
        </p>
        {recipe.command && (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-ink-950 px-4 py-3 text-xs text-sand-100/90 ring-1 ring-white/10">
            <code>{recipe.command}</code>
          </pre>
        )}
        {recipe.note && (
          <p className="mt-3 text-xs text-sand-100/50">
            <T k={recipe.note} />
          </p>
        )}
        <p className="mt-3 text-xs text-sand-100/50">
          <T k="admin.updates.migrationsNote" />
        </p>
      </section>

      {/* ── schema ──────────────────────────────────────────────────────── */}
      <SchemaSection report={schema} />

      <div className="mt-6">
        <UpdateCheckForm initial={checkEnabled} />
      </div>
    </>
  );
}

/**
 * The database's side of the story.
 *
 * Per the ADR the admin shows versions, never migration names — except when
 * they did not apply, which is the one case a human has to resolve and the one
 * that is otherwise completely invisible. So the healthy states get a single
 * quiet line and the broken ones get room to explain themselves.
 */
function SchemaSection({ report }: { report: SchemaReport }) {
  const attention = schemaNeedsAttention(report);
  const { status, hint } = describeReport(report);

  return (
    <section
      className={
        attention
          ? "mt-6 rounded-3xl bg-ink-900 p-6 ring-1 ring-ember-500/40"
          : "mt-6 rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10"
      }
    >
      <div className="flex items-center gap-2">
        <Database
          className={attention ? "size-5 text-ember-400" : "size-5 text-sand-100/50"}
        />
        <h3 className="font-display text-xl font-semibold">
          <T k="admin.updates.schemaHeading" />
        </h3>
      </div>
      <dl className="mt-5 text-sm">
        <Row label={<T k="admin.updates.schemaState" />}>
          <Pill tone={attention ? "warn" : "ok"} k={status} />
        </Row>
      </dl>
      {hint && (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-sand-100/60">
          <T k={hint} />
        </p>
      )}
    </section>
  );
}

function describeReport(report: SchemaReport): {
  status: DictKey;
  hint: DictKey | null;
} {
  switch (report.kind) {
    case "no-key":
      return {
        status: "admin.updates.schemaUnknownState",
        hint: "admin.updates.schemaNoKeyHint",
      };
    case "never-run":
      return {
        status: "admin.updates.schemaNeverRun",
        hint: "admin.updates.schemaNeverRunHint",
      };
    case "error":
      return {
        status: "admin.updates.schemaUnknownState",
        hint: "admin.updates.schemaErrorHint",
      };
    case "known":
      switch (report.state.kind) {
        case "current":
          return { status: "admin.updates.schemaCurrent", hint: null };
        case "fresh":
        case "behind":
          // Not an alarm: the runner applies these at the next build or
          // container start. It only matters if it is still saying this
          // afterwards, which is what the hint tells the reader to watch for.
          return {
            status: "admin.updates.schemaBehind",
            hint: "admin.updates.schemaBehindHint",
          };
        case "unseeded":
          return {
            status: "admin.updates.schemaUnseeded",
            hint: "admin.updates.schemaUnseededHint",
          };
        case "unknown":
          return {
            status: "admin.updates.schemaAhead",
            hint: "admin.updates.schemaAheadHint",
          };
      }
  }
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2.5">
      <dt className="text-sand-100/80">{label}</dt>
      <dd className="flex items-center gap-2">{children}</dd>
    </div>
  );
}

function Pill({ tone, k }: { tone: "ok" | "warn" | "muted"; k: DictKey }) {
  const tones = {
    ok: "bg-sage-500/20 text-sage-300",
    warn: "bg-ember-500/20 text-ember-300",
    muted: "bg-white/5 text-sand-100/60",
  } as const;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      <T k={k} />
    </span>
  );
}
