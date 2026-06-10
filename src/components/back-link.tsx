"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A "back" control that returns to the previous page when there's in-app history
 * (e.g. arriving from search or a listing), and falls back to a given route for
 * a directly-opened / shared link. Replaces a hard-coded `<Link href="/">`,
 * which always sent you home regardless of where you came from.
 */
export function BackLink({
  fallback = "/",
  className,
  children,
}: {
  fallback?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
