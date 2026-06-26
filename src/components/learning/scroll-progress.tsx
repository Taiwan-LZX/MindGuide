'use client';

import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

// ─── Scroll Progress ──────────────────────────────────────────────────────
//
// A 1px hairline that sits at the top of any scrollable region and fills
// proportionally to how far the user has scrolled. In academic-paper terms,
// it's the equivalent of a "you are here" marker on the edge of a printed
// page. SSR-safe: useScroll requires a ref to a real DOM element, so we
// attach it to the immediate parent on mount.

export function ScrollProgress({
  targetRef,
  className = '',
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const { scrollYProgress } = useScroll({ container: targetRef });
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 28,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{ scaleX }}
      className={`pointer-events-none absolute left-0 right-0 top-0 z-10 h-px origin-left bg-neutral-800 dark:bg-neutral-200 ${className}`}
      aria-hidden="true"
    />
  );
}
