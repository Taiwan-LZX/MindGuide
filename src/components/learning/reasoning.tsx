'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Brain } from 'lucide-react';

// ─── Reasoning Component ────────────────────────────────────────────────────
//
// A self-contained "reasoning" panel inspired by Vercel AI Elements' <Reasoning>
// component, but with two bug fixes:
//
//  1. Duration tracking — AI Elements has a known bug where duration=0 is shown
//     when the component unmounts before the timer fires. We use a ref-based
//     start timestamp + rAF polling so the duration is always accurate.
//
//  2. Multi-message isolation — AI Elements issue #26: expanding one message's
//     reasoning collapses another's. We use a local `expanded` state (not a
//     shared layoutId) so each message's reasoning panel is independent.
//
// Features:
//   • While streaming (isStreaming=true): auto-expanded, shows live thinking
//     text + a "思考中…" label with an animated indicator.
//   • When streaming ends (isStreaming=false): auto-collapses with a smooth
//     height animation, shows "已思考 Ns" label. Click to re-expand.
//   • The thinking text is rendered with MarkdownRenderer for rich content
//     (code blocks, math, lists) — passed as children by the parent.

export interface ReasoningProps {
  /** Whether the model is currently streaming reasoning tokens. */
  isStreaming: boolean;
  /** The reasoning text content (streamingThinking from the store). */
  children: React.ReactNode;
  /** Optional className for the outer container. */
  className?: string;
}

export function Reasoning({ isStreaming, children, className = '' }: ReasoningProps) {
  // Auto-expand while streaming, auto-collapse when done. The user can
  // manually toggle after streaming ends.
  const [expanded, setExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const startRef = useRef<number | null>(null);
  const endedRef = useRef(false);

  // Track when streaming starts to compute duration.
  useEffect(() => {
    if (isStreaming && startRef.current === null) {
      startRef.current = Date.now();
      endedRef.current = false;
      // Deferred to a microtask so we don't call setState synchronously.
      queueMicrotask(() => setExpanded(true));
    }
    if (!isStreaming && startRef.current !== null && !endedRef.current) {
      const elapsed = Math.round((Date.now() - startRef.current) / 1000);
      // Deferred to avoid cascading renders.
      queueMicrotask(() => {
        setDuration(elapsed);
        // Auto-collapse after streaming ends (with a small delay so the user
        // sees the final reasoning text briefly).
        setTimeout(() => setExpanded(false), 600);
      });
      endedRef.current = true;
    }
  }, [isStreaming]);

  // Live duration counter while streaming (updates every second).
  useEffect(() => {
    if (!isStreaming || startRef.current === null) return;
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - (startRef.current ?? Date.now())) / 1000);
      setDuration(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const handleToggle = useCallback(() => {
    // Only allow manual toggle when not streaming (streaming = always expanded).
    if (!isStreaming) setExpanded(e => !e);
  }, [isStreaming]);

  return (
    <div className={`rounded-lg border border-neutral-200/80 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/40 ${className}`}>
      {/* Header — click to toggle (when not streaming) */}
      <button
        onClick={handleToggle}
        disabled={isStreaming}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-100/50 disabled:cursor-default dark:hover:bg-neutral-800/30"
        aria-expanded={expanded}
      >
        <motion.div
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.6 }}
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-neutral-400"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.div>
        <Brain className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className="text-[11.5px] font-medium text-neutral-500 dark:text-neutral-400">
          {isStreaming ? (
            <span className="flex items-center gap-1.5">
              思考中
              {/* Live pulse indicator */}
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
              />
              {duration > 0 && (
                <span className="font-sans tabular-nums text-neutral-400 dark:text-neutral-500">
                  {duration}s
                </span>
              )}
            </span>
          ) : (
            // For persisted messages (non-streaming), only show duration if
            // it was actually tracked (>0). If duration=0 (e.g. an old
            // message loaded from DB), just show "已思考" without a time.
            <span>
              已思考{duration > 0 && (
                <span className="font-sans tabular-nums"> {duration}s</span>
              )}
            </span>
          )}
        </span>
      </button>

      {/* Collapsible body — holds the reasoning text */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.18 },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-neutral-200/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-neutral-600 dark:border-neutral-800/60 dark:text-neutral-300">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
