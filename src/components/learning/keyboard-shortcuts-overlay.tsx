'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Shortcut definitions ────────────────────────────────────────────────────

interface ShortcutDef {
  keys: string;
  desc: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutDef[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '对话',
    items: [
      { keys: 'Enter', desc: '发送消息' },
      { keys: 'Shift + Enter', desc: '换行输入' },
      { keys: 'Esc', desc: '停止流式输出 / 关闭浮层' },
    ],
  },
  {
    title: '导航',
    items: [
      { keys: '⌘ K', desc: '打开命令面板' },
      { keys: '?', desc: '显示快捷键帮助' },
      { keys: '⌘ B', desc: '折叠 / 展开侧边栏' },
      { keys: '⌘ ,', desc: '打开显示设置' },
    ],
  },
  {
    title: '功能面板',
    items: [
      { keys: '⌘ 1', desc: '任务规划' },
      { keys: '⌘ 2', desc: '学习卡片' },
      { keys: '⌘ 3', desc: '成就系统' },
      { keys: '⌘ 4', desc: '学习统计' },
      { keys: '⌘ 5', desc: '知识图谱' },
      { keys: '⌘ 6', desc: '学习笔记' },
    ],
  },
  {
    title: '卡片复习',
    items: [
      { keys: 'Space / Enter', desc: '翻面查看答案' },
      { keys: '1 — 4', desc: '评级：忘了 / 困难 / 良好 / 简单' },
      { keys: 'Esc', desc: '退出复习模式' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only trigger on bare '?' (Shift+/) — ignore when typing in inputs
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    const isEditable =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      target?.isContentEditable === true;

    if (e.key === '?' && !isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      setOpen(o => !o);
      return;
    }
    if (e.key === 'Escape' && open) {
      setOpen(false);
    }
  }, [open]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ks-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-neutral-900/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            key="ks-panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26, mass: 0.9 }}
            onClick={e => e.stopPropagation()}
            className="relative w-[min(680px,92vw)] max-h-[82vh] overflow-y-auto custom-scrollbar rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.18)] dark:border-neutral-800 dark:bg-neutral-900"
            role="dialog"
            aria-label="键盘快捷键"
          >
            {/* Header — academic editorial style */}
            <div className="mb-7 flex items-start justify-between border-b border-neutral-100 pb-5 dark:border-neutral-800">
              <div>
                <p className="font-serif text-[10px] uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
                  Reference
                </p>
                <h2 className="mt-1 font-serif text-[22px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
                  键盘快捷键
                </h2>
                <p className="mt-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                  随时按 <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">?</kbd> 调出本页
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Groups — two-column on wide, single on narrow */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
              {SHORTCUT_GROUPS.map((group, gi) => (
                <section key={group.title} className={gi % 2 === 1 ? 'sm:pt-7' : ''}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="font-serif text-[10px] tabular-nums text-neutral-300 dark:text-neutral-600">
                      §{String(gi + 1).padStart(2, '0')}
                    </span>
                    <h3 className="font-serif text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                      {group.title}
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {group.items.map(item => (
                      <li
                        key={item.keys}
                        className="flex items-center justify-between gap-3 text-[12px]"
                      >
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {item.desc}
                        </span>
                        <kbd className="shrink-0 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-sans text-[11px] tabular-nums text-neutral-700 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          {item.keys}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* Footer note */}
            <div className="mt-7 flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <p className="font-serif text-[11px] italic text-neutral-400 dark:text-neutral-500">
                Tip — 在输入框聚焦时，快捷键将被禁用以避免冲突。
              </p>
              <p className="font-sans text-[10px] uppercase tracking-wider text-neutral-300 dark:text-neutral-600">
                MindGuide
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
