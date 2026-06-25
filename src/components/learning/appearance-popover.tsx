'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Monitor, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { usePreferences } from '@/store/preferences-store';
import { MouseFollowTooltip } from '@/components/learning/mouse-follow-tooltip';

// ─── AppearanceButton ──────────────────────────────────────────────────────
// A single icon button (Sun/Moon) that opens a small popover grouping the two
// appearance preferences: theme (light/dark/system) and motion (on/off).
//
// Rationale: both are "appearance" prefs, so they belong together (cf. macOS
// System Settings → Appearance, iOS Settings → Display & Brightness). Surfacing
// theme here also fixes a prior UX gap — the theme toggle used to live only
// inside the ⌘K command palette, invisible to mouse-only users.
//
// The button is placement-agnostic: it renders as an 8×8 icon button and the
// popover is portalled to <body>, positioned relative to the button rect so it
// works whether the button sits in the full sidebar footer or the collapsed
// icon strip.

// SSR-safe mounted flag (no setState-in-render).
const emptySubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

const themeOptions = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '系统', icon: Monitor },
] as const;

export function AppearanceButton() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { motionEnabled, setMotionEnabled } = usePreferences();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; placeAbove: boolean }>({
    x: 0,
    y: 0,
    placeAbove: true,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);

  // next-themes returns undefined on first render → only show the icon after
  // mount to avoid a hydration mismatch (server can't know the theme).
  const isDark = mounted && resolvedTheme === 'dark';
  const TriggerIcon = isDark ? Moon : Sun;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Position the popover relative to the button whenever it opens.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    // Prefer placing the popover above the button (the button lives near the
    // sidebar bottom). If there isn't enough room above, fall back to below.
    const spaceAbove = r.top;
    const placeAbove = spaceAbove > 320;
    setPos({
      x: r.left,
      y: placeAbove ? r.top : r.bottom,
      placeAbove,
    });
  }, [open]);

  // Keep the current theme option highlighted. next-themes `theme` may be
  // undefined on first render; fall back to resolvedTheme so the segmented
  // control still shows a sensible selection before mount.
  const activeTheme = theme ?? (isDark ? 'dark' : 'light');

  return (
    <>
      <MouseFollowTooltip content="外观 · 主题与动态效果">
        <button
          ref={btnRef}
          type="button"
          aria-label="外观设置"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
            open
              ? 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
          }`}
        >
          <TriggerIcon className="h-4 w-4" />
        </button>
      </MouseFollowTooltip>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label="外观设置"
                initial={{ opacity: 0, y: pos.placeAbove ? 6 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: pos.placeAbove ? 6 : -6 }}
                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  position: 'fixed',
                  left: pos.x,
                  top: pos.placeAbove ? undefined : pos.y,
                  bottom: pos.placeAbove ? window.innerHeight - pos.y : undefined,
                  width: 248,
                  zIndex: 70,
                }}
                className="overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900/95"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <h2 className="text-[12px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    外观
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                    aria-label="关闭"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>

                <div className="mx-3 h-px bg-neutral-100 dark:bg-neutral-800" />

                {/* Theme segmented control */}
                <div className="px-3.5 py-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                      主题
                    </span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      · 色彩模式
                    </span>
                  </div>
                  <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800/80">
                    {themeOptions.map(opt => {
                      const selected = activeTheme === opt.value;
                      const OptIcon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setTheme(opt.value)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${
                            selected
                              ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
                              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                          }`}
                        >
                          <OptIcon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mx-3 h-px bg-neutral-100 dark:bg-neutral-800" />

                {/* Motion toggle */}
                <div className="px-3.5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                          动态效果
                        </span>
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                          · 动画与过渡
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-400 dark:text-neutral-500">
                        关闭后界面动画与过渡即时完成，减少视觉波动
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={motionEnabled}
                      aria-label="切换动态效果"
                      onClick={() => setMotionEnabled(!motionEnabled)}
                      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                        motionEnabled
                          ? 'bg-neutral-900 dark:bg-neutral-100'
                          : 'bg-neutral-200 dark:bg-neutral-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full shadow-sm transition-transform duration-200 ${
                          motionEnabled
                            ? 'translate-x-4 bg-white dark:bg-neutral-900'
                            : 'translate-x-0.5 bg-white dark:bg-neutral-300'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
