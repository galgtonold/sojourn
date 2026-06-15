"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * "New post" creates an empty draft immediately and drops the author into the
 * full editor — so the photo/track uploaders and the AI draft panel (which need
 * a real post id to attach to and generate from) are available from step one.
 * Abandoned drafts show as untitled entries in the posts list and can be deleted.
 */
export default function NewPostPage() {
  const router = useRouter();
  const started = useRef(false);

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
        if (res.ok) {
          const data = (await res.json()) as { id?: string };
          if (data.id) {
            router.replace(`/admin/posts/${data.id}`);
            return;
          }
        }
      } catch {
        /* fall through to the dashboard */
      }
      router.replace("/admin");
    })();
  }, [router]);

  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <Loader2 className="size-8 animate-spin text-ember-400" />
    </div>
  );
}
