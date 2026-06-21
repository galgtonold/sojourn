"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useT } from "@/components/i18n";

/**
 * "New post" creates an empty draft immediately and drops the author into the
 * full editor — so the photo/track uploaders and the AI draft panel (which need
 * a real post id to attach to and generate from) are available from step one.
 * Abandoned drafts show as untitled entries in the posts list and can be deleted.
 *
 * Posts are trip-scoped: a collaborator without any granted trip can't create
 * one yet, so we surface that instead of silently bouncing to the dashboard.
 */
export default function NewPostPage() {
  const router = useRouter();
  const t = useT();
  const started = useRef(false);
  const [error, setError] = useState<"noTrip" | "failed" | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/posts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };
        if (res.ok && data.id) {
          router.replace(`/admin/posts/${data.id}`);
          return;
        }
        setError(data.error === "no-editable-trip" ? "noTrip" : "failed");
      } catch {
        setError("failed");
      }
    })();
  }, [router]);

  if (error) {
    return (
      <div className="mx-auto grid min-h-[70dvh] max-w-md place-items-center px-6 text-center">
        <div>
          <AlertTriangle className="mx-auto mb-4 size-8 text-ember-400" />
          <p className="text-sand-100/80">
            {t(
              error === "noTrip"
                ? "admin.newPost.noTrip"
                : "admin.newPost.failed",
            )}
          </p>
          <Link
            href="/admin"
            className="mt-6 inline-block rounded-full border border-white/10 px-4 py-2 text-sm text-sand-100/80 transition hover:border-white/25"
          >
            {t("admin.dashboardLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <Loader2 className="size-8 animate-spin text-ember-400" />
    </div>
  );
}
