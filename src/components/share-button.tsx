"use client";
import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useT } from "@/components/i18n";

/**
 * Share the current post: the native share sheet where available (mobile),
 * otherwise copy the link to the clipboard and confirm inline.
 */
export function ShareButton({ title }: { title: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User dismissed the sheet, or it's unavailable — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — nothing more we can do silently.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-sand-50 transition hover:border-ember-400 hover:text-ember-400"
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? t("post.linkCopied") : t("post.share")}
    </button>
  );
}
