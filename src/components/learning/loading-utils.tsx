'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Shared Spring Config ────────────────────────────────────────────────────

const spring = { type: 'spring' as const, stiffness: 350, damping: 28 };

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LoadingSkeleton
// ═══════════════════════════════════════════════════════════════════════════════

interface LoadingSkeletonProps {
  className?: string;
  /** Number of skeleton lines (default 3) */
  lines?: number;
  /** Gap between lines (default 'gap-2') */
  lineGap?: string;
}

/**
 * Content skeleton placeholder with shimmer animation.
 * Lines have decreasing widths to simulate natural text.
 */
export function LoadingSkeleton({
  className,
  lines = 3,
  lineGap = 'gap-2',
}: LoadingSkeletonProps) {
  // Widths decrease per line to mimic a heading + body text
  const widths = ['w-full', 'w-11/12', 'w-10/12', 'w-9/12', 'w-8/12', 'w-7/12'];

  return (
    <div className={cn('flex flex-col', lineGap, className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className={cn(
            'h-3.5 rounded-md',
            widths[i % widths.length],
            'bg-neutral-200 dark:bg-neutral-700',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: spring }}
        >
          {/* Shimmer overlay */}
          <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
            <motion.div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/15"
              animate={{ translateX: ['0%', '200%'] }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 0.15,
              }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. LoadingOverlay
// ═══════════════════════════════════════════════════════════════════════════════

interface LoadingOverlayProps {
  /** Whether the overlay is active */
  active: boolean;
  className?: string;
  /** Optional label below the spinner */
  label?: string;
  /** Enable backdrop blur (default false) */
  blur?: boolean;
}

/**
 * Semi-transparent overlay with centered spinner + optional label.
 * Smooth fade-in/out via AnimatePresence.
 */
export function LoadingOverlay({
  active,
  className,
  label,
  blur = false,
}: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className={cn(
            'absolute inset-0 z-50 flex items-center justify-center',
            'bg-white/60 dark:bg-neutral-900/60',
            blur && 'backdrop-blur-sm',
            active ? 'pointer-events-auto' : 'pointer-events-none',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
          <div className="flex flex-col items-center gap-2">
            {/* Spinner */}
            <div
              className={cn(
                'h-6 w-6 rounded-full',
                'border-2 border-neutral-300 dark:border-neutral-600',
                'border-t-neutral-900 dark:border-t-white',
                'animate-spin',
              )}
            />
            {label && (
              <motion.span
                className="text-xs text-neutral-500 dark:text-neutral-400 select-none"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: spring }}
              >
                {label}
              </motion.span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. InlineSpinner
// ═══════════════════════════════════════════════════════════════════════════════

interface InlineSpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'h-3.5 w-3.5 border-[1.5px]',
  md: 'h-4 w-4 border-2',
};

/**
 * Small border-based rotating spinner for inline use (buttons, list items).
 */
export function InlineSpinner({ size = 'sm', className }: InlineSpinnerProps) {
  return (
    <div
      className={cn(
        'inline-block rounded-full animate-spin',
        'border-neutral-300 dark:border-neutral-600',
        'border-t-neutral-900 dark:border-t-white',
        sizeClasses[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RippleButton
// ═══════════════════════════════════════════════════════════════════════════════

interface RippleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Ripple colour (default 'rgba(0,0,0,0.12)' / dark: 'rgba(255,255,255,0.18)') */
  rippleColor?: string;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

let rippleId = 0;

/**
 * Button wrapper that spawns a Material-style ripple from the click point.
 */
export function RippleButton({
  rippleColor,
  className,
  children,
  onClick,
  ...props
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = ++rippleId;

      setRipples((prev) => [...prev, { id, x, y, size }]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);

      onClick?.(e);
    },
    [onClick],
  );

  return (
    <button
      className={cn('relative overflow-hidden', className)}
      onClick={handleClick}
      {...props}
    >
      {children}
      {/* Ripple layer */}
      <span className="pointer-events-none absolute inset-0">
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            className="absolute rounded-full"
            style={{
              left: r.x,
              top: r.y,
              width: r.size,
              height: r.size,
              backgroundColor:
                rippleColor ??
                'var(--ripple-color, rgba(0,0,0,0.12))',
            }}
            initial={{ opacity: 0.6, scale: 0 }}
            animate={{ opacity: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        ))}
      </span>
      {/* CSS variable for dark-mode ripple color fallback */}
      <style>{`
        :root { --ripple-color: rgba(0,0,0,0.12); }
        .dark { --ripple-color: rgba(255,255,255,0.18); }
      `}</style>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PulseLoader
// ═══════════════════════════════════════════════════════════════════════════════

interface PulseLoaderProps {
  /** Number of dots (default 3) */
  dots?: number;
  className?: string;
}

/**
 * Pulsing dots loader — subtle, suitable for inline placement.
 * Dots animate in staggered sequence.
 */
export function PulseLoader({ dots = 3, className }: PulseLoaderProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: dots }).map((_, i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.2,
          }}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </span>
  );
}