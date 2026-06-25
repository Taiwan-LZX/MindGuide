'use client';

import React, { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

// ─── SSR-safe client detection (no setState-in-effect) ────────────────────
const emptySubscribe = () => () => {};
const getIsClient = () => true;
const getIsServer = () => false;

// ─── MouseFollowTooltip ───────────────────────────────────────────────────
// A tooltip that appears *immediately* on hover (no native-title delay) and
// follows the cursor, flipping/clamping so it never overflows its boundary
// (defaults to the viewport; pass `boundaryRef` to clamp within a module).
//
// The trigger is wrapped in a `<span class="contents">` (display:contents) so
// it generates no box of its own and does not affect the consumer's layout —
// the child keeps its place in whatever flex/grid/block context it lives in.
// The tooltip itself is portalled to <body> so it is not affected by
// transformed ancestors (framer-motion scale/translate would otherwise pin a
// `position:fixed` child to the ancestor's box).

interface MouseFollowTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Element whose rect the tooltip must stay inside. Defaults to viewport. */
  boundaryRef?: React.RefObject<HTMLElement>;
  /** Pixel gap between cursor and tooltip edge. */
  offset?: number;
  /** Show delay in ms. 0 = immediate (the whole point of this component). */
  delay?: number;
  /** Max width of the tooltip box. */
  maxWidth?: number;
  /** Extra class names on the tooltip bubble. */
  className?: string;
  /** Vertical anchor bias. 'auto' flips when overflowing. */
  vAlign?: 'below' | 'above' | 'auto';
}

export function MouseFollowTooltip({
  content,
  children,
  boundaryRef,
  offset = 14,
  delay = 0,
  maxWidth = 280,
  className = '',
  vAlign = 'auto',
}: MouseFollowTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // SSR-safe: false on server + first hydration render, true after.
  const mounted = useSyncExternalStore(emptySubscribe, getIsClient, getIsServer);

  const tipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last measured tooltip size — updated after mount so the first frame uses
  // an estimate, then corrects on the next animation frame.
  const sizeRef = useRef<{ w: number; h: number }>({ w: 220, h: 36 });
  // Last cursor position — used to recompute after measuring real size.
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current!);
    };
  }, []);

  const compute = useCallback(
    (cx: number, cy: number) => {
      const tw = sizeRef.current.w;
      const th = sizeRef.current.h;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let bx = 0;
      let by = 0;
      let bw = vw;
      let bh = vh;
      if (boundaryRef?.current) {
        const r = boundaryRef.current.getBoundingClientRect();
        bx = r.left;
        by = r.top;
        bw = r.width;
        bh = r.height;
      }

      // Horizontal: prefer right of cursor, flip left if it overflows.
      let x = cx + offset;
      if (x + tw > bx + bw) x = cx - tw - offset;
      // Vertical: prefer below, flip above if it overflows the bottom edge.
      let y = cy + offset;
      const overflowBelow = y + th > by + bh;
      if (vAlign === 'below') y = cy + offset;
      else if (vAlign === 'above') y = cy - th - offset;
      else if (overflowBelow) y = cy - th - offset;

      // Clamp into boundary (with a 4px inset).
      x = Math.max(bx + 4, Math.min(x, bx + bw - tw - 4));
      y = Math.max(by + 4, Math.min(y, by + bh - th - 4));

      setPos({ x, y });
    },
    [offset, boundaryRef, vAlign],
  );

  // Once visible, measure the real tooltip size and recompute position so the
  // first frame's estimate is corrected immediately.
  useEffect(() => {
    if (visible && tipRef.current) {
      sizeRef.current = {
        w: tipRef.current.offsetWidth,
        h: tipRef.current.offsetHeight,
      };
      compute(cursorRef.current.x, cursorRef.current.y);
    }
  }, [visible, content, compute]);

  const handleEnter = useCallback(
    (e: React.MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (timerRef.current) clearTimeout(timerRef.current);
      const show = () => {
        setVisible(true);
        compute(e.clientX, e.clientY);
      };
      if (delay > 0) timerRef.current = setTimeout(show, delay);
      else show();
    },
    [compute, delay],
  );

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => compute(e.clientX, e.clientY));
    },
    [compute],
  );

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current!);
    setVisible(false);
  }, []);

  return (
    <>
      <span
        className="contents"
        onMouseEnter={handleEnter}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                ref={tipRef}
                role="tooltip"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{
                  opacity: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] },
                  scale: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] },
                  // Liquid follow: fast spring settles in ~90ms, no perceptible
                  // lag but feels organic rather than rigidly glued to cursor.
                  x: { type: 'spring', stiffness: 600, damping: 36, mass: 0.6 },
                  y: { type: 'spring', stiffness: 600, damping: 36, mass: 0.6 },
                }}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  maxWidth,
                  pointerEvents: 'none',
                  zIndex: 100,
                }}
                className={`rounded-md border border-neutral-200 bg-white/95 px-2.5 py-1.5 font-sans text-[11.5px] leading-relaxed text-neutral-600 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-300 ${className}`}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
