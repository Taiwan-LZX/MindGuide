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
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { Tooltip } from '@/components/ui/tooltip';

// ─── Design Tokens (matching reference image language) ────────────────────
const T = {
  panelBg: 'bg-white dark:bg-[#1c1c1e]',
  headerBg: 'bg-[#F8F7F3] dark:bg-[#2a2a2c]',
  panelShadow: 'shadow-[0_4px_12px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.15)]',
  panelBorder: 'border border-[#E8E7E3] dark:border-[#38383a]',
  panelRound: 'rounded-2xl',
  titleText: 'text-[#333333] dark:text-[#E0E0E0]',
  titleSize: 'text-[14px]',
  titleWeight: 'font-medium',
  closeBtnBg: 'bg-[#D1D0CC] dark:bg-[#48484a]',
  closeBtnIcon: 'text-white dark:text-white',
  closeBtnSize: 'h-[26px] w-[26px]',
  closeBtnRound: 'rounded-full',
  // Recessed content area
  recessedBg: 'bg-[#F5F4F0] dark:bg-[#242426]',
  // Feature item
  itemBg: 'bg-white dark:bg-[#2c2c2e]',
  itemBorder: 'border border-[#E8E7E3] dark:border-[#3a3a3c]',
  itemRound: 'rounded-xl',
  itemIconColor: 'text-[#999999] dark:text-[#8e8e93]',
  itemLabelColor: 'text-[#555555] dark:text-[#c7c7cc]',
  itemLabelSize: 'text-[13px]',
  itemArrowColor: 'text-[#C7C7CC] dark:text-[#48484a]',
  // Groove / recessed shadow on items
  itemGroove: 'shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]',
  itemHoverShadow: 'shadow-[inset_0_1px_1px_rgba(0,0,0,0.02),0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.15)]',
  divider: 'bg-[#E8E7E3] dark:bg-[#38383a]',
} as const;

// ─── Feature definitions ──────────────────────────────────────────────────

const features = [
  { id: 'tasks', label: '任务规划', description: '制定学习计划，分解学习目标，追踪完成进度', icon: ListChecks },
  { id: 'cards', label: '学习卡片', description: '创建闪卡，通过主动回忆和间隔重复强化记忆', icon: CreditCard },
  { id: 'achievements', label: '成就系统', description: '解锁学习成就徽章，持续获得激励反馈', icon: Trophy },
  { id: 'stats', label: '学习统计', description: '可视化学习数据和时间分布，量化进步轨迹', icon: BarChart3 },
  { id: 'graph', label: '知识图谱', description: '构建知识网络图，发现概念间的关联与层级', icon: Network },
  { id: 'notes', label: '学习笔记', description: '使用富文本编辑器记录学习笔记，支持公式、代码和高亮', icon: StickyNote },
];

// ─── Animation Variants ────────────────────────────────────────────────────

const popoverVariants = {
  hidden: { opacity: 0, x: -12, scale: 0.95 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { type: 'spring', stiffness: 380, damping: 28, mass: 0.8 },
  },
  exit: {
    opacity: 0, x: -8, scale: 0.96,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.035 * i, duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ─── Feature Row ───────────────────────────────────────────────────────────

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
    <Tooltip text={feature.description}>
      <motion.button
        custom={index}
        variants={rowVariants}
        initial="hidden"
        animate="visible"
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className={`flex w-full items-center gap-3 ${T.itemBg} ${T.itemBorder} ${T.itemRound} ${T.itemGroove} px-3 py-2.5 text-left transition-all duration-200 hover:${T.itemHoverShadow}`}
        style={{
          boxShadow: undefined,
        }}
      >
        {/* Icon recessed well */}
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${T.recessedBg} shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]`}>
          <feature.icon className={`h-4 w-4 ${T.itemIconColor}`} />
        </div>
        <span className={`flex-1 ${T.itemLabelSize} font-medium ${T.itemLabelColor}`}>
          {feature.label}
        </span>
        <ChevronRight className={`h-3.5 w-3.5 ${T.itemArrowColor}`} />
      </motion.button>
    </Tooltip>
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

  return (
    <AnimatePresence>
      {createNewPanelOpen && (
        <motion.div
          ref={panelRef}
          variants={popoverVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={`fixed bottom-3 left-3 z-[60] w-[252px] overflow-hidden ${T.panelRound} ${T.panelBorder} ${T.panelBg} ${T.panelShadow}`}
        >
          {/* Header — elevated warm cream layer */}
          <div className={`flex items-center justify-between border-b border-[#E8E7E3] px-4 py-3 ${T.headerBg} dark:border-[#38383a]`}>
            <div className="flex items-center gap-2">
              <Sparkles className={`h-3.5 w-3.5 ${T.itemIconColor}`} />
              <h2 className={`${T.titleSize} ${T.titleWeight} ${T.titleText}`}>
                更多功能
              </h2>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.88 }}
              onClick={() => setCreateNewPanelOpen(false)}
              className={`flex items-center justify-center ${T.closeBtnSize} ${T.closeBtnRound} ${T.closeBtnBg} ${T.closeBtnIcon} transition-transform`}
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* Feature List — recessed groove area */}
          <div className={`space-y-1.5 ${T.recessedBg} p-2`}>
            {features.map((feature, i) => (
              <FeatureRow
                key={feature.id}
                feature={feature}
                index={i + 1}
                onClick={() => setActiveFeatureView(feature.id)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
