'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const popoverVariants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity: 0, y: 4, scale: 0.99,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 4 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.025 * i, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
  }),
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

// ─── Feature Row — soft highlight box with smooth follow animation ──────────
// Instead of a hard bg color swap, we use a layered approach:
//   - a motion highlight layer (absolute, rounded) that fades/slides in
//   - the icon gently slides right and the chevron nudges, all spring-eased
// This produces a "liquid follow" feel rather than a stiff text hover.

function FeatureRow({
  feature,
  index,
  onClick,
}: {
  feature: (typeof features)[number];
  index: number;
  onClick: () => void;
}) {
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
        className="group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left"
      >
      {/* Soft highlight layer — fades in on hover via group-hover (the motion
          whileHover on a pointer-events-none span never fires, so CSS is the
          correct mechanism here). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg bg-neutral-100 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-neutral-800/70"
      />
      {/* Left accent line — appears on hover for a refined "selected" cue */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 origin-center scale-y-50 rounded-full bg-neutral-400 opacity-0 transition-all duration-200 group-hover:scale-y-100 group-hover:opacity-100 dark:bg-neutral-500"
      />

      {/* Icon — gentle color shift on hover */}
      <feature.icon className="relative z-10 h-4 w-4 shrink-0 text-neutral-400 transition-colors duration-200 group-hover:text-neutral-700 dark:group-hover:text-neutral-200" />

      {/* Label — color lifts toward ink on hover */}
      <span className="relative z-10 flex-1 text-[13px] font-medium text-neutral-600 transition-colors duration-200 group-hover:text-neutral-900 dark:text-neutral-300 dark:group-hover:text-neutral-50">
        {feature.label}
      </span>

      <KbdHint keys={['⌘', feature.shortcut]} />

      {/* Chevron — nudges right on hover via group-hover */}
      <ChevronRight className="relative z-10 h-3.5 w-3.5 text-neutral-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-400" />
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
          className="fixed bottom-3 left-3 z-[60] w-60 overflow-hidden rounded-xl border border-neutral-200/80 bg-white/95 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18),0_2px_8px_-4px_rgba(0,0,0,0.1)] backdrop-blur-md dark:border-neutral-700/60 dark:bg-neutral-900/95 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5),0_2px_8px_-4px_rgba(0,0,0,0.4)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <h2 className="text-[12px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              更多功能
            </h2>
            <button
              onClick={() => setCreateNewPanelOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          <div className="mx-3 h-px bg-neutral-100 dark:bg-neutral-800" />

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
          <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-1.5 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
              按 <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 text-[9px] font-medium dark:border-neutral-700 dark:bg-neutral-800">⌘</kbd>
              <kbd className="ml-0.5 rounded border border-neutral-200 bg-neutral-50 px-1 text-[9px] font-medium dark:border-neutral-700 dark:bg-neutral-800">1-6</kbd> 快速跳转
            </span>
            <span className="text-[10px] text-neutral-300 dark:text-neutral-700">
              {features.length} 项
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
