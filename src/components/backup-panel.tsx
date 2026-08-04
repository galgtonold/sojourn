"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  TerminalSquare,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { T, useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

type ImportResult = {
  tables: Record<string, number>;
  photos: number;
  photosFailed: string[];
};

type Progress = { received: number; total: number };

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
  const [progress, setProgress] = useState<Progress | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetched rather than linked, so a failure arrives as a message here instead
  // of a browser error page with the admin chrome gone. An export can take a
  // while and can legitimately refuse (too large); neither should look like the
  // site broke.
  async function download() {
    setError(null);
    setProgress(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `export failed (${res.status})`);
      }
      // Read the stream rather than `res.blob()`, which buffers the whole
      // archive with nothing to show for it — the reason this looked frozen and
      // then finished all at once. content-length is set by the route, so the
      // percentage is real; when a proxy strips it we count bytes instead,
      // which still beats a spinner.
      const total = Number(res.headers.get("content-length") ?? 0);
      const reader = res.body?.getReader();
      let blob: Blob;
      if (!reader) {
        blob = await res.blob();
      } else {
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          // Clamped: a proxy that gzips reports the compressed length while
          // handing us decompressed bytes, and a download sitting at 140% reads
          // as a bug in the thing you are trusting with your journal.
          setProgress({
            received,
            total: total > 0 ? Math.max(total, received) : 0,
          });
        }
        blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      }
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
      setProgress(null);
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

  const rows = done ? Object.values(done.tables).reduce((a, b) => a + b, 0) : 0;
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  return (
    <div className="space-y-8">
      {error && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-3xl bg-red-500/5 p-6 text-sm text-red-300 ring-1 ring-red-500/30"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <section className="rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <Download className="size-5 text-ember-400" />
          <h3 className="font-display text-xl font-semibold">
            <T k="admin.settings.backup.exportTitle" />
          </h3>
        </div>
        <p className="mt-2 text-sm text-sand-100/60">
          <T k="admin.settings.backup.exportBody" />
        </p>

        <button
          type="button"
          onClick={download}
          disabled={downloading}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
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

        {downloading && (
          <div className="mt-4" aria-live="polite">
            {/* Two phases, and they feel completely different: gathering has
                nothing to report until the first byte arrives, so it says so
                rather than showing a bar stuck at zero. */}
            <p className="text-xs text-sand-100/60">
              {progress ? (
                <T
                  k="admin.settings.backup.downloading"
                  vars={{
                    done: formatBytes(progress.received),
                    total:
                      progress.total > 0 ? formatBytes(progress.total) : "…",
                  }}
                />
              ) : (
                <T k="admin.settings.backup.gathering" />
              )}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full bg-ember-500 transition-[width] duration-150",
                  pct === null && "w-1/3 animate-pulse",
                )}
                style={pct === null ? undefined : { width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-sand-100/50">
          <T k="admin.settings.backup.notIncluded" />
        </p>
      </section>

      <section className="rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <Upload className="size-5 text-ember-400" />
          <h3 className="font-display text-xl font-semibold">
            <T k="admin.settings.backup.importTitle" />
          </h3>
        </div>
        <p className="mt-2 text-sm text-sand-100/60">
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
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
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
          <p className="mt-5 rounded-2xl bg-ink-950/60 px-4 py-3 text-sm text-sand-100/60 ring-1 ring-white/5">
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

      <section className="rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <TerminalSquare className="size-5 text-ember-400" />
          <h3 className="font-display text-xl font-semibold">
            <T k="admin.settings.backup.deepTitle" />
          </h3>
        </div>
        <p className="mt-2 text-sm text-sand-100/60">
          <T k="admin.settings.backup.deepBody" />
        </p>
        <code className="mt-4 block overflow-x-auto rounded-2xl bg-ink-950/60 px-4 py-3 text-xs text-sand-100/80 ring-1 ring-white/5">
          sh scripts/backup.sh backups
        </code>
      </section>
    </div>
  );
}
