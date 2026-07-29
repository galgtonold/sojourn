"use client";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { staggerDelay } from "@/lib/stagger";

/**
 * Fades + lifts children into view on scroll. Honors prefers-reduced-motion.
 *
 * Pass the item's `index` in its list rather than a delay: the cascade is
 * capped to the first screenful (see @/lib/stagger), so a long list can never
 * turn scrolling into waiting.
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  /** Position in the surrounding list; only the first few are staggered. */
  index?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  // Reduced motion: render in place, no fade/lift and no scroll-driven animation.
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      // Positive margin starts the fade while the card is still below the fold,
      // so scrolling quickly lands on content that has already arrived rather
      // than on a blank grid. It used to be "-60px", which meant a card had to
      // be 60px INSIDE the viewport before its animation even began.
      viewport={{ once: true, margin: "300px 0px" }}
      transition={{
        duration: 0.5,
        delay: staggerDelay(index),
        ease: [0.2, 0.7, 0.2, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
