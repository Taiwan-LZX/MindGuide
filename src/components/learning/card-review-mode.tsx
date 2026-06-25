'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCw, Check, AlertCircle } from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { formatInterval } from '@/lib/sm2';

// ─── Card Review Mode (SM-2) ───────────────────────────────────────────────
//
// A focused review session:
//  1. Fetches the due queue from /api/sessions/[id]/cards/review
//  2. Shows one card at a time; learner flips to reveal the answer
//  3. Self-rates on a 4-button scale: 忘了 / 困难 / 良好 / 简单
//  4. SM-2 algorithm on the backend updates ease/interval/dueAt
//  5. End-of-session summary shows distribution of ratings
//
// The visual style stays thesis-monochrome: hairline borders, no shadows,
// neutral grayscale, serif numerals for the countdown, tabular-nums for stats.

type Quality = 0 | 2 | 4 | 5;

const QUALITY_BUTTONS: Array<{
  q: Quality;
  label: string;
  hint: string;
  nextLabel: string;
}> = [
  { q: 0, label: '忘了',  hint: '完全想不起来',  nextLabel: '1 分钟' },
  { q: 2, label: '困难',  hint: '想了很久才记起', nextLabel: '1 天' },
  { q: 4, label: '良好',  hint: '稍有迟疑但答对', nextLabel: '下次' },
  { q: 5, label: '简单',  hint: '立刻就能答出',   nextLabel: '更久以后' },
];

export function CardReviewMode() {
  const {
    reviewQueue,
    reviewIndex,
    reviewFlipped,
    reviewStats,
    isFetchingReview,
    isSubmittingReview,
    flipReviewCard,
    submitReview,
    exitReview,
  } = useLearningStore();

  const total = reviewQueue.length;
  const current = reviewQueue[reviewIndex];
  const isDone = reviewIndex >= total && total > 0;

  // Keyboard shortcuts: Space/Enter to flip, 1/2/3/4 to rate (after flip)
  React.useEffect(() => {
    if (!current || isDone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!reviewFlipped) flipReviewCard();
      } else if (reviewFlipped) {
        if (e.key === '1') { void submitReview(0); }
        else if (e.key === '2') { void submitReview(2); }
        else if (e.key === '3') { void submitReview(4); }
        else if (e.key === '4') { void submitReview(5); }
      }
      if (e.key === 'Escape') { exitReview(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, isDone, reviewFlipped, flipReviewCard, submitReview, exitReview]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (isFetchingReview) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-full flex-1 flex-col items-center justify-center gap-3"
      >
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-700 dark:border-neutral-700 dark:border-t-neutral-200" />
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">正在准备复习卡片…</p>
      </motion.div>
    );
  }

  // ── Empty queue state ──────────────────────────────────────────────────
  if (total === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full flex-1 flex-col items-center justify-center px-6"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 dark:border-neutral-700">
          <Check className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <p className="mb-1 text-[14px] font-medium text-neutral-700 dark:text-neutral-200">今日复习已完成</p>
        <p className="mb-5 text-[12px] text-neutral-400">没有需要复习的卡片，去学习一会儿吧</p>
        <button
          onClick={exitReview}
          className="rounded-md border border-neutral-300 px-4 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          返回卡片列表
        </button>
      </motion.div>
    );
  }

  // ── Session complete summary ───────────────────────────────────────────
  if (isDone) {
    const rated = reviewStats.forgot + reviewStats.hard + reviewStats.good + reviewStats.easy;
    const accuracy = rated > 0 ? Math.round(((reviewStats.good + reviewStats.easy) / rated) * 100) : 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full flex-1 flex-col items-center justify-center px-6"
      >
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200">
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </div>
        <p className="mb-1 font-serif text-[18px] font-medium text-neutral-900 dark:text-neutral-100">复习完成</p>
        <p className="mb-5 text-[12px] text-neutral-500 dark:text-neutral-400">
          共复习 {rated} 张 · 正确率 {accuracy}%
        </p>

        {/* Rating distribution (horizontal hairline bars, monochrome) */}
        <div className="mb-6 w-full max-w-[420px] space-y-2.5">
          {[
            { label: '忘了', count: reviewStats.forgot, accent: 'bg-neutral-900 dark:bg-neutral-100' },
            { label: '困难', count: reviewStats.hard, accent: 'bg-neutral-700 dark:bg-neutral-300' },
            { label: '良好', count: reviewStats.good, accent: 'bg-neutral-500 dark:bg-neutral-400' },
            { label: '简单', count: reviewStats.easy, accent: 'bg-neutral-300 dark:bg-neutral-600' },
          ].map((row) => {
            const pct = rated > 0 ? (row.count / rated) * 100 : 0;
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400">{row.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <motion.div
                    className={`h-full rounded-full ${row.accent}`}
                    style={{ transformOrigin: 'left' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
                    transition={{ type: 'spring', stiffness: 200, damping: 28, mass: 1 }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
                  {row.count}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={exitReview}
          className="rounded-md border border-neutral-300 px-5 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          返回卡片列表
        </button>
      </motion.div>
    );
  }

  if (!current) return null;

  const progressPct = total > 0 ? (reviewIndex / total) * 100 : 0;

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Header — minimal: close + progress */}
      <div className="shrink-0 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
        <div className="mx-auto flex max-w-[640px] items-center gap-4">
          <button
            onClick={exitReview}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="退出复习"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
              <span>复习模式</span>
              <span className="tabular-nums">{reviewIndex + 1} / {total}</span>
            </div>
            <div className="h-[2px] w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <motion.div
                className="h-full rounded-full bg-neutral-700 dark:bg-neutral-200"
                style={{ transformOrigin: 'left' }}
                initial={false}
                animate={{ scaleX: Math.max(0, Math.min(1, progressPct / 100)) }}
                transition={{ type: 'spring', stiffness: 200, damping: 28, mass: 1 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card area */}
      <div className="flex flex-1 items-center justify-center px-6 py-6">
        <div className="w-full max-w-[640px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 30, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -24, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }}
              className="relative"
              style={{ perspective: '1200px' }}
            >
              {/* Flip card */}
              <div
                className="relative h-[300px] cursor-pointer"
                style={{ transformStyle: 'preserve-3d' }}
                onClick={() => !reviewFlipped && flipReviewCard()}
              >
                <motion.div
                  className="absolute inset-0"
                  animate={{ rotateY: reviewFlipped ? 180 : 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 28, mass: 1.1 }}
                  style={{ transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                >
                  {/* Front (question) */}
                  <div className="flex h-full flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-700 dark:bg-neutral-900">
                    <span className="mb-3 text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
                      问题 · {current.category}
                    </span>
                    <p className="text-center font-serif text-[20px] font-medium leading-relaxed text-neutral-900 dark:text-neutral-100">
                      {current.front}
                    </p>
                    {/* SM-2 state footer */}
                    <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
                      <span>第 {current.repetition + 1} 次复习</span>
                      <span className="text-neutral-300 dark:text-neutral-700">·</span>
                      <span>难度 {current.ease.toFixed(2)}</span>
                      {current.interval > 0 && (
                        <>
                          <span className="text-neutral-300 dark:text-neutral-700">·</span>
                          <span>上次间隔 {formatInterval(current.interval)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Back (answer) — rotated 180deg */}
                  <div
                    className="absolute inset-0 flex h-full flex-col items-center justify-center rounded-xl border border-neutral-300 bg-neutral-50 p-8 dark:border-neutral-600 dark:bg-neutral-800"
                    style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
                  >
                    <span className="mb-3 text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                      答案
                    </span>
                    <p className="text-center font-serif text-[18px] leading-relaxed text-neutral-900 dark:text-neutral-100">
                      {current.back}
                    </p>
                    <p className="mt-4 max-w-[80%] text-center text-[11px] text-neutral-400 dark:text-neutral-500">
                      {current.front}
                    </p>
                  </div>
                </motion.div>
              </div>

              {/* Hint or rating buttons */}
              <div className="mt-6">
                <AnimatePresence mode="wait">
                  {!reviewFlipped ? (
                    <motion.div
                      key="hint"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 dark:text-neutral-500"
                    >
                      <RotateCw className="h-3 w-3" />
                      <span>点击卡片或按 空格 翻面查看答案</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="ratings"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="grid grid-cols-4 gap-2"
                    >
                      {QUALITY_BUTTONS.map((b) => (
                        <motion.button
                          key={b.q}
                          whileHover={{
                            y: -2,
                            transition: { type: 'spring', stiffness: 400, damping: 22 },
                          }}
                          whileTap={{
                            scale: 0.97,
                            transition: { type: 'spring', stiffness: 600, damping: 25 },
                          }}
                          disabled={isSubmittingReview}
                          onClick={() => { void submitReview(b.q); }}
                          className="group flex flex-col items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-3 transition-colors hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                        >
                          <span className="text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{b.label}</span>
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{b.hint}</span>
                          <span className="text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">下次 {b.nextLabel}</span>
                          <kbd className="mt-0.5 rounded border border-neutral-200 px-1 py-0.5 text-[9px] text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
                            {b.q === 0 ? '1' : b.q === 2 ? '2' : b.q === 4 ? '3' : '4'}
                          </kbd>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom helper */}
      <div className="shrink-0 border-t border-neutral-100 px-6 py-2 dark:border-neutral-800">
        <div className="mx-auto flex max-w-[640px] items-center justify-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
          <AlertCircle className="h-3 w-3" />
          <span>按 Esc 退出 · 评级会调整卡片下次出现的时间间隔</span>
        </div>
      </div>
    </div>
  );
}
