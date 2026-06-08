"use client";
import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";

/**
 * Fades + lifts children into view on scroll.
 *
 * Uses the `useInView` hook rather than the declarative `whileInView` prop:
 * `whileInView` is unreliable for elements already within the viewport on the
 * initial mount (above the fold), where it can leave them stuck at the `initial`
 * (hidden) state — see e.g. the /trips index, whose cards all render above the
 * fold. `useInView` attaches its IntersectionObserver in a post-mount effect and
 * reliably reports the initial intersection, so above-the-fold content reveals
 * too. Scroll-triggered reveal for below-the-fold content is unchanged.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
