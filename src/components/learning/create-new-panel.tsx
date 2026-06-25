'use client';

import React, { useEffect, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useMotionTemplate,
  type Variants,
} from 'framer-motion';
import {
  X,
  ListChecks,
  CreditCard,
  Trophy,
  BarChart3,
  Network,
  ChevronRight,
  StickyNote,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { MouseFollowTooltip } from '@/components/learning/mouse-follow-tooltip';

// ─── Feature definitions ──────────────────────────────────────────────────

const features = [
  { id: 'tasks', label: '任务规划', description: '制定学习计划，分解学习目标，追踪完成进度', icon: ListChecks, shortcut: '1' },
  { id: 'cards', label: '学习卡片', description: '创建闪卡，通过主动回忆和间隔重复强化记忆', icon: CreditCard, shortcut: '2' },
  { id: 'achievements', label: '成就系统', description: '解锁学习成就徽章，持续获得激励反馈', icon: Trophy, shortcut: '3' },
  { id: 'stats', label: '学习统计', description: '可视化学习数据和时间分布，量化进步轨迹', icon: BarChart3, shortcut: '4' },
  { id: 'graph', label: '知识图谱', description: '构建知识网络图，发现概念间的关联与层级', icon: Network, shortcut: '5' },
  { id: 'notes', label: '学习笔记', description: '使用富文本编辑器记录学习笔记，支持公式、代码和高亮', icon: StickyNote, shortcut: '6' },
];

// ─── Animation Variants ────────────────────────────────────────────────────
//
// Tactile ("手感") tuning notes:
//  - Popover uses a soft spring (stiffness 280, damping 26, mass 0.9) so it
//    overshoots ~2% and settles in ~520ms — feels physical rather than snapped.
//  - Exit is a 240ms ease-in with a small y+scale drop so the panel "leaves
//    the desk" rather than vanishing.
//  - Row stagger uses spring entry (stiffness 380, damping 30) so each row
//    lands with a tiny settle; delay grows by 35ms per row so the cascade
//    reads as deliberate, not robotic.
//  - Icon/chevron/accent-line nudges use an overshoot cubic-bezier
//    (0.34, 1.56, 0.64, 1) so they "land" with a tiny bounce — same physical
//    metaphor as the spring entry, but cheaper than nested motion variants.

// Overshoot bezier — feels like a small spring without the runtime cost.
const TACTILE_BEZIER = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const popoverVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.965 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 280,
      damping: 26,
      mass: 0.9,
    },
  },
  // Exit "recedes" toward the trigger (bottom-left). The previous 0.975 scale
  // was too subtle to read as "going back inside" — bumped to 0.93 so the
  // recession is perceptible. y:14 + opacity 0 = drops down + fades out,
  // matching the bottom-left transformOrigin.
  //
  // EXIT EASING (anim-refine-003):
  //   · Previous: single { duration: 0.26, ease: [0.4, 0, 1, 1] } for all 3
  //     properties. Strong ease-in meant opacity stayed near 1 for the first
  //     ~104ms — user perceived "nothing happening" then a sudden vanish.
  //   · Now: split per-property. Opacity uses ease-OUT [0.16, 1, 0.3, 1] so
  //     the panel visibly fades from frame 1 (no dead-time window). Scale
  //     and y keep ease-IN for the "falling away" physical metaphor, but
  //     finish in 0.22s (vs 0.26s) so they complete before opacity fully
  //     fades — the panel "shrinks + drops" first, then ghost-fades out.
  exit: {
    opacity: 0,
    y: 14,
    scale: 0.93,
    transition: {
      opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
      scale: { duration: 0.22, ease: [0.4, 0, 1, 1] },
      y: { duration: 0.24, ease: [0.4, 0, 1, 1] },
    },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.05 + 0.035 * i,
      type: 'spring',
      stiffness: 380,
      damping: 30,
      mass: 0.7,
    },
  }),
};

const footerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delay: 0.34, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  },
};

// ─── Kbd hint ────────────────────────────────────────────────────────────────

function KbdHint({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      {keys.map((k, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <span className="text-[10px] text-neutral-400">+</span>}
          <kbd className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-neutral-200 bg-neutral-50 px-1 font-sans text-[10px] font-medium text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500">
            {k}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

// ─── Feature Row — cursor-follow spotlight + tactile nudge ─────────────────
//
// The "follow-through smoothness" the user asked for is produced by three
// layered mechanisms working together:
//
//  1) Cursor-follow spotlight: a radial-gradient layer whose center X/Y is
//     driven by a spring-smoothed motion value. As the mouse moves within
//     the row, the soft glow trails it with a small lag (~80ms) — this is
//     the "liquid follow" feel.
//
//  2) Tactile micro-nudge on icon + chevron + accent line: CSS transforms
//     with an overshoot bezier (0.34, 1.56, 0.64, 1) — same physical
//     metaphor as a spring but cheaper. Lands with a tiny bounce.
//
//  3) Tactile press: `whileTap` scales to 0.985 with a stiff spring,
//     giving a "depress" feel like a physical key.

function FeatureRow({
  feature,
  index,
  onClick,
}: {
  feature: (typeof features)[number];
  index: number;
  onClick: () => void;
}) {
  // Cursor-follow spotlight motion values
  const mouseX = useMotionValue(120);
  const mouseY = useMotionValue(20);
  const springConfig = { stiffness: 320, damping: 28, mass: 0.5 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  // Build a radial-gradient template that tracks the smoothed cursor position.
  // Two stacked layers (one for light, one for dark) so we can tune the
  // spotlight color per theme without flash.
  const spotlight = useMotionTemplate`radial-gradient(110px circle at ${smoothX}px ${smoothY}px, var(--row-spotlight), transparent 70%)`;

  return (
    <MouseFollowTooltip
      maxWidth={240}
      content={
        <span className="block text-neutral-600 dark:text-neutral-300">
          {feature.description}
        </span>
      }
    >
      <motion.button
        custom={index}
        variants={rowVariants}
        initial="hidden"
        animate="visible"
        onClick={onClick}
        whileTap={{ scale: 0.985, transition: { type: 'spring', stiffness: 600, damping: 30 } }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseX.set(e.clientX - rect.left);
          mouseY.set(e.clientY - rect.top);
        }}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2 text-left"
      >
        {/* Base solid hover layer (CSS — fades in via group-hover) */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg bg-neutral-100/70 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 dark:bg-neutral-800/70"
        />
        {/* Cursor-follow spotlight layer (light mode) */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 dark:hidden"
          style={{
            background: spotlight,
            ['--row-spotlight' as string]: 'rgba(0,0,0,0.05)',
          }}
        />
        {/* Cursor-follow spotlight layer (dark mode) */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden rounded-lg opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 dark:block"
          style={{
            background: spotlight,
            ['--row-spotlight' as string]: 'rgba(255,255,255,0.06)',
          }}
        />
        {/* Left accent line — overshoot bezier scale-y + opacity on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 origin-center scale-y-50 rounded-full bg-neutral-400 opacity-0 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-y-100 group-hover:opacity-100 dark:bg-neutral-500"
        />

        {/* Icon — gentle color shift on hover (CSS) + tactile nudge (overshoot bezier) */}
        <feature.icon
          className="relative z-10 h-4 w-4 shrink-0 text-neutral-400 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-[1.5px] group-hover:text-neutral-700 dark:group-hover:text-neutral-200"
        />

        {/* Label — color lifts toward ink on hover */}
        <span className="relative z-10 flex-1 text-[13px] font-medium text-neutral-600 transition-colors duration-200 group-hover:text-neutral-900 dark:text-neutral-300 dark:group-hover:text-neutral-50">
          {feature.label}
        </span>

        <KbdHint keys={['⌘', feature.shortcut]} />

        {/* Chevron — tactile nudge right on hover with overshoot */}
        <ChevronRight
          className="relative z-10 h-3.5 w-3.5 text-neutral-300 opacity-55 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-[3px] group-hover:text-neutral-500 group-hover:opacity-100 dark:text-neutral-600 dark:group-hover:text-neutral-400"
        />
      </motion.button>
    </MouseFollowTooltip>
  );
}

// ─── More Features Panel ─────────────────────────────────────────────────

export function MoreFeaturesPanel() {
  const { createNewPanelOpen, setCreateNewPanelOpen, setActiveFeatureView } = useLearningStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!createNewPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const trigger = e.target as HTMLElement;
        if (trigger.closest('[data-more-features-trigger]')) return;
        setCreateNewPanelOpen(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [createNewPanelOpen, setCreateNewPanelOpen]);

  // Keyboard shortcuts: ⌘1-6 / Ctrl+1-6 to jump to features, Esc to close
  useEffect(() => {
    if (!createNewPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCreateNewPanelOpen(false);
        return;
      }
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const f = features.find(x => x.shortcut === e.key);
        if (f) {
          setActiveFeatureView(f.id);
          setCreateNewPanelOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [createNewPanelOpen, setActiveFeatureView, setCreateNewPanelOpen]);

  return (
    <AnimatePresence>
      {createNewPanelOpen && (
        <motion.div
          ref={panelRef}
          variants={popoverVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: 'bottom left', willChange: 'transform, opacity' }}
          // backdrop-blur-sm (vs -md) — cheaper on the GPU, visually identical
          // at this small popover size. The solid bg-white/95 already provides
          // the opacity; the blur is just for the soft focus effect behind.
          className="fixed bottom-3 left-3 z-[60] w-60 overflow-hidden rounded-xl border border-neutral-200/80 bg-white/95 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18),0_2px_8px_-4px_rgba(0,0,0,0.1)] backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-900/95 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5),0_2px_8px_-4px_rgba(0,0,0,0.4)]"
        >
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } }}
            className="flex items-center justify-between px-3 py-2.5"
          >
            <h2 className="text-[12px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              更多功能
            </h2>
            <motion.button
              onClick={() => setCreateNewPanelOpen(false)}
              whileHover={{ scale: 1.1, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
              whileTap={{ scale: 0.9, transition: { type: 'spring', stiffness: 600, damping: 25 } }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1, transition: { delay: 0.15, duration: 0.45, ease: [0.25, 0.1, 0.25, 1] } }}
            style={{ transformOrigin: 'left' }}
            className="mx-3 h-px bg-neutral-100 dark:bg-neutral-800"
          />

          <div className="p-1.5">
            {features.map((feature, i) => (
              <FeatureRow
                key={feature.id}
                feature={feature}
                index={i + 1}
                onClick={() => setActiveFeatureView(feature.id)}
              />
            ))}
          </div>

          {/* Footer hint */}
          <motion.div
            variants={footerVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center justify-between border-t border-neutral-100 px-3 py-1.5 dark:border-neutral-800"
          >
            <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
              按 <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 text-[9px] font-medium dark:border-neutral-700 dark:bg-neutral-800">⌘</kbd>
              <kbd className="ml-0.5 rounded border border-neutral-200 bg-neutral-50 px-1 text-[9px] font-medium dark:border-neutral-700 dark:bg-neutral-800">1-6</kbd> 快速跳转
            </span>
            <span className="text-[10px] text-neutral-300 dark:text-neutral-700">
              {features.length} 项
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
