"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { useT } from "@/components/i18n";

export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  // Searching runs on the server (slow, semantic), so surface a spinner while
  // the results navigation is in flight — submitting felt unresponsive without
  // it, especially when only the query changes on an already-open /search page.
  const [pending, startTransition] = useTransition();
  const t = useT();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    startTransition(() => {
      router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    });
  }

  return (
    <form onSubmit={submit} className="relative">
      {pending ? (
        <Loader2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-ember-400" />
      ) : (
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sand-100/40" />
      )}
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search.placeholder")}
        className="w-full rounded-full border border-white/10 bg-ink-800 py-3.5 pl-12 pr-4 text-base outline-none transition focus:border-ember-400"
      />
    </form>
  );
}
