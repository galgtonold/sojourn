"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveals each *direct child* (e.g. every paragraph/heading a Markdown block
 * renders) as it scrolls into view. Children already in view on mount are shown
 * immediately — they're never hidden, so there's no above-the-fold flash, and
 * if JS never runs the content simply stays visible.
 */
export function RevealChildren({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.children) as HTMLElement[];

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("reveal-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    const fold = window.innerHeight * 0.92;
    for (const el of els) {
      // Only arm (hide) elements below the fold; visible ones stay put.
      if (el.getBoundingClientRect().top < fold) {
        el.classList.add("reveal-in");
      } else {
        el.classList.add("reveal-pending");
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
