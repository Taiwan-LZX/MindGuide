'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Mouse-following Tooltip ──────────────────────────────────────────────────

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!visible) setVisible(true);
    // Position tooltip above-right of cursor, clamped to viewport
    let x = e.clientX + 14;
    let y = e.clientY - 10;
    if (typeof window !== 'undefined') {
      const tooltipWidth = 220;
      const tooltipHeight = 56;
      if (x + tooltipWidth > window.innerWidth - 16) x = e.clientX - tooltipWidth - 10;
      if (y + tooltipHeight > window.innerHeight - 16) y = e.clientY - tooltipHeight;
      if (y < 8) y = 8;
    }
    setPos({ x, y });
  }, [visible]);

  const handleMouseLeave = useCallback(() => {
    setVisible(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setVisible(true);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ type: 'spring' as const, stiffness: 500, damping: 30, duration: 0.2 }}
            className="pointer-events-none fixed z-[100] max-w-[200px] rounded-md border border-neutral-200/60 bg-white px-2.5 py-1.5 shadow-sm dark:border-neutral-700/60 dark:bg-neutral-800"
            style={{ left: pos.x, top: pos.y }}
          >
            <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

