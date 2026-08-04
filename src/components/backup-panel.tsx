"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { T, useT } from "@/components/i18n";
import { DOWNLOAD_COOKIE } from "@/lib/backup/download-token";
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
  // The token rides in the href, and the route echoes it back as a cookie with
  // the response headers — which arrive exactly when the archive is ready. See
  // @/lib/backup/download-token for why that is the only signal a real download
  // link can give back.
  //
  // Minted in an effect rather than during render: crypto.randomUUID() on the
  // server would differ from the client's and break hydration on the one
  // attribute that matters here.
  const [token, setToken] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => setToken(crypto.randomUUID()), []);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preparing || !token) return;
    const seen = () =>
      document.cookie.split("; ").includes(`${DOWNLOAD_COOKIE}=${token}`);
    const stop = () => {
      // Clear it, or the next click finishes the instant it starts.
      document.cookie = `${DOWNLOAD_COOKIE}=; Path=/; Max-Age=0`;
      setPreparing(false);
      // A fresh token for the next click, or the stale cookie would make it
      // look finished the instant it started.
      setToken(crypto.randomUUID());
    };
    const poll = setInterval(() => {
      if (seen()) stop();
    }, 400);
    // A backstop, because a download that never starts must not leave the
    // button spinning forever — the browser has its own error surface for that.
    const giveUp = setTimeout(stop, 5 * 60 * 1000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [preparing, token]);

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

        {/*
          A plain download link, not a fetch into a Blob. The browser is already
          good at this: it starts the download itself, streams to disk, and shows
          its own progress in the place people look for downloads. Doing it in
          JavaScript meant buffering the whole archive in the tab, drawing a
          second progress bar that competed with the browser's, and only handing
          the file over once it was entirely in memory — so the real download
          appeared, complete, at the very end.
        */}
        <a
          href={`/api/admin/backup${token ? `?t=${token}` : ""}`}
          download
          aria-disabled={preparing}
          onClick={(e) => {
            // A second click would start a second assembly of the same archive.
            if (preparing) {
              e.preventDefault();
              return;
            }
            // Deliberately NOT preventing the default: the browser does the
            // download. This only starts watching for the token to come back.
            setPreparing(true);
          }}
          className={cn(
            "mt-5 inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400",
            preparing && "pointer-events-none opacity-60",
          )}
        >
          {preparing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          <T
            k={
              preparing
                ? "admin.settings.backup.exportBusy"
                : "admin.settings.backup.exportAction"
            }
          />
        </a>
        <p className="mt-3 text-xs text-sand-100/50">
          <T k="admin.settings.backup.exportWait" />
        </p>
        <p className="mt-2 text-xs text-sand-100/50">
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
