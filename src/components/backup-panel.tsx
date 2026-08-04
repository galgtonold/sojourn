"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "@/components/i18n";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

type ImportResult = {
  tables: Record<string, number>;
  photos: number;
  photosFailed: string[];
};

/**
 * Download an export, and — only on a site with nothing in it — load one back.
 *
 * `isEmpty` is decided on the server. The button being absent is the polite
 * half; the route refuses independently, because a disabled control is a hint
 * rather than a guarantee.
 */
export function BackupPanel({ isEmpty }: { isEmpty: boolean }) {
  const t = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetched rather than linked, so a failure arrives as a message here instead
  // of as a browser error page with the admin chrome gone. An export can take a
  // while and can legitimately refuse (too large), and neither should look like
  // the site broke.
  async function download() {
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `export failed (${res.status})`);
      }
      const blob = await res.blob();
      // The filename the server chose, so the date in it is the server's.
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
        "sojourn-export.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  async function runImport(file: File) {
    const ok = await confirm({
      title: t("admin.settings.backup.importTitle"),
      message: t("admin.settings.backup.importBody"),
      confirmLabel: t("admin.settings.backup.importAction"),
    });
    if (!ok) return;

    setError(null);
    setDone(null);
    setImporting(true);
    try {
      const form = new FormData();
      form.append("archive", file);
      const res = await fetch("/api/admin/backup/import", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as ImportResult & {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `import failed (${res.status})`);
      setDone(body);
      // The site now has content, so this panel's own state is stale.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows = done
    ? Object.values(done.tables).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-xl">
          <T k="admin.settings.backup.exportTitle" />
        </h2>
        <p className="mt-2 text-sm text-sand-100/70">
          <T k="admin.settings.backup.exportBody" />
        </p>
        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-ink-950/60 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400 disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          <T
            k={
              downloading
                ? "admin.settings.backup.exportBusy"
                : "admin.settings.backup.exportAction"
            }
          />
        </button>
        <p className="mt-3 text-xs text-sand-100/50">
          <T k="admin.settings.backup.notIncluded" />
        </p>
      </section>

      <section>
        <h2 className="font-display text-xl">
          <T k="admin.settings.backup.importTitle" />
        </h2>
        <p className="mt-2 text-sm text-sand-100/70">
          <T k="admin.settings.backup.importBody" />
        </p>

        {isEmpty ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runImport(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-ink-950/60 px-4 py-2 text-sm transition hover:border-ember-400 hover:text-ember-400 disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              <T
                k={
                  importing
                    ? "admin.settings.backup.importBusy"
                    : "admin.settings.backup.importAction"
                }
              />
            </button>
          </>
        ) : (
          <p className="mt-4 rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3 text-sm text-sand-100/60">
            <T k="admin.settings.backup.importBlocked" />
          </p>
        )}

        {done && (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300">
            <Check className="size-4" />
            <T
              k="admin.settings.backup.importDone"
              vars={{ n: rows, p: done.photos }}
            />
          </p>
        )}
      </section>

      {error && (
        <p
          role="status"
          className={cn("rounded-xl border px-4 py-3 text-sm", "border-red-500/30 bg-red-500/5 text-red-300")}
        >
          {error}
        </p>
      )}

      <section className="border-t border-white/5 pt-8">
        <h2 className="font-display text-lg">
          <T k="admin.settings.backup.deepTitle" />
        </h2>
        <p className="mt-2 text-sm text-sand-100/60">
          <T k="admin.settings.backup.deepBody" />
        </p>
      </section>
    </div>
  );
}
