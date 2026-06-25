'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Trash2, Settings, Eraser } from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';

// ─── Design Tokens (from reference image) ──────────────────────────────────
const TOKENS = {
  panelBg: 'bg-white dark:bg-[#1c1c1e]',
  headerBg: 'bg-[#F8F7F3] dark:bg-[#2a2a2c]',
  panelShadow: 'shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]',
  panelBorder: 'border border-[#E8E7E3] dark:border-[#38383a]',
  panelRound: 'rounded-2xl',
  titleText: 'text-[#333333] dark:text-[#E0E0E0]',
  titleSize: 'text-[16px]',
  titleWeight: 'font-medium',
  closeBtnBg: 'bg-[#D1D0CC] dark:bg-[#48484a]',
  closeBtnIcon: 'text-white dark:text-white',
  closeBtnSize: 'h-[28px] w-[28px]',
  closeBtnRound: 'rounded-full',
  actionText: 'text-[#555555] dark:text-[#a1a1a6]',
  actionHover: 'hover:bg-[#F5F5F3] dark:hover:bg-[#3a3a3c]',
  actionDanger: 'text-red-500 dark:text-red-400',
  divider: 'bg-[#E8E7E3] dark:bg-[#38383a]',
} as const;

// ─── Animation Variants ────────────────────────────────────────────────────

const panelVariants = {
  hidden: { opacity: 0, scale: 0.92, y: -8 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 28, mass: 0.8 },
  },
  exit: {
    opacity: 0, scale: 0.95, y: -4,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.03 * i, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ─── Action Row ────────────────────────────────────────────────────────────

function ActionRow({
  icon: Icon,
  label,
  hint,
  danger,
  onClick,
  index,
}: {
  icon: React.ElementType;
  label: string;
  hint?: string;
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
      whileHover={{ x: 3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] transition-colors duration-150 ${
        danger
          ? `${TOKENS.actionDanger} hover:bg-red-50 dark:hover:bg-red-500/10`
          : `${TOKENS.actionText} ${TOKENS.actionHover}`
      }`}
    >
      <Icon className="h-[14px] w-[14px] shrink-0 opacity-60" />
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{hint}</span>}
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
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="fixed inset-0 z-[49]"
            onClick={() => setSettingsPanelOpen(false)}
          />

          {/* Panel — top-right corner, overlapping with three-dot button */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`fixed right-1.5 top-1 z-[50] w-[260px] overflow-hidden ${TOKENS.panelRound} ${TOKENS.panelBorder} ${TOKENS.panelBg} ${TOKENS.panelShadow}`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-3.5 ${TOKENS.headerBg}`}>
              <h2 className={`${TOKENS.titleSize} ${TOKENS.titleWeight} ${TOKENS.titleText}`}>
                快捷菜单
              </h2>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.88 }}
                onClick={() => setSettingsPanelOpen(false)}
                className={`flex items-center justify-center ${TOKENS.closeBtnSize} ${TOKENS.closeBtnRound} ${TOKENS.closeBtnBg} ${TOKENS.closeBtnIcon} transition-transform`}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </motion.button>
            </div>

            {/* 设置 entry — opens the full detailed SettingsView */}
            <div className="px-3 py-2">
              <motion.button
                custom={0}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.97 }}
                onClick={openSettings}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] font-medium text-[#333333] transition-colors duration-150 hover:bg-[#F5F5F3] dark:text-[#E0E0E0] dark:hover:bg-[#3a3a3c]"
              >
                <Settings className="h-[14px] w-[14px] shrink-0 opacity-70" />
                <span className="flex-1 text-left">设置</span>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">主题 · 配色 · 布局</span>
              </motion.button>
            </div>

            {/* Divider */}
            <div className={`mx-5 h-px ${TOKENS.divider}`} />

            {/* Quick session actions */}
            <div className="px-3 py-2">
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
