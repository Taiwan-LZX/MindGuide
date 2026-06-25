'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Trash2, Settings, Eraser } from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';

// ─── Animation Variants ────────────────────────────────────────────────────
//
// The quick menu now shares the exact same neutral palette as the rest of the
// app (neutral-50/100/200/800/900) — no more warm #F8F7F3 / #E8E7E3 hexes that
// made it read like a separate design system. Radii, borders and shadows match
// the sidebar + chat surface language so the popover feels native.

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 },
  },
  exit: {
    opacity: 0, scale: 0.97, y: -4,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.03 * i, duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ─── Action Row ────────────────────────────────────────────────────────────

function ActionRow({
  icon: Icon,
  label,
  danger,
  onClick,
  index,
}: {
  icon: React.ElementType;
  label: string;
  danger?: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] transition-colors duration-150 ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
          : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      <Icon className="h-[14px] w-[14px] shrink-0 opacity-60" />
      <span className="flex-1 text-left">{label}</span>
    </motion.button>
  );
}

// ─── Quick Settings Menu (three-dot popover) ───────────────────────────────
// A slim dropdown opened by the three-dot button. The display-type prefs
// (theme / motion / layout / accent) now live in the full SettingsView, so
// this menu only carries: a "设置" entry (opens SettingsView) + quick session
// actions (new / clear / delete) for fast access without leaving the chat.

export function SettingsPanel() {
  const {
    createSession,
    currentSessionId,
    deleteSession,
    settingsPanelOpen,
    setSettingsPanelOpen,
    setSettingsViewOpen,
  } = useLearningStore();

  const handleNewChat = async () => {
    await createSession('新的学习主题');
    setSettingsPanelOpen(false);
  };

  const handleClearChat = async () => {
    if (!currentSessionId) return;
    try {
      await fetch(`/api/sessions/${currentSessionId}/messages`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
    useLearningStore.setState({ messages: [] });
    setSettingsPanelOpen(false);
  };

  const handleDeleteChat = async () => {
    if (!currentSessionId) return;
    await deleteSession(currentSessionId);
    setSettingsPanelOpen(false);
  };

  const openSettings = () => {
    setSettingsPanelOpen(false);
    setSettingsViewOpen(true);
  };

  return (
    <AnimatePresence>
      {settingsPanelOpen && (
        <>
          {/* Backdrop — transparent click-catcher */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="fixed inset-0 z-[49]"
            onClick={() => setSettingsPanelOpen(false)}
          />

          {/* Panel — top-right corner, overlapping with three-dot button.
              Uses the same neutral surface language as the sidebar + chat
              surface (white/neutral-900 bg, neutral-200/800 border, soft
              shadow) so it reads as part of the same app. */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-2 top-2 z-[50] w-[260px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12),0_2px_8px_-4px_rgba(0,0,0,0.08)] dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5),0_2px_8px_-4px_rgba(0,0,0,0.4)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <h2 className="text-[14px] font-medium text-neutral-800 dark:text-neutral-100">
                快捷菜单
              </h2>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSettingsPanelOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                aria-label="关闭"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </motion.button>
            </div>

            {/* 设置 entry — opens the full detailed SettingsView */}
            <div className="px-2.5 py-2">
              <motion.button
                custom={0}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={openSettings}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition-colors duration-150 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                <Settings className="h-[14px] w-[14px] shrink-0 opacity-70" />
                <span className="flex-1 truncate text-left">设置</span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-400 dark:text-neutral-500">主题 · 配色 · 布局</span>
              </motion.button>
            </div>

            {/* Divider — inset to align with the action row padding */}
            <div className="mx-4 h-px bg-neutral-100 dark:bg-neutral-800" />

            {/* Quick session actions */}
            <div className="px-2.5 py-2">
              <ActionRow icon={Plus} label="创建新对话" onClick={handleNewChat} index={1} />
              <ActionRow icon={Eraser} label="清空对话" onClick={handleClearChat} index={2} />
              {currentSessionId && (
                <ActionRow icon={Trash2} label="删除对话" danger onClick={handleDeleteChat} index={3} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
