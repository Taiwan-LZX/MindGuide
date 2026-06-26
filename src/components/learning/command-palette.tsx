'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOTION } from '@/lib/motion-tokens';
import {
  Search,
  Plus,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ListChecks,
  CreditCard,
  Trophy,
  Network,
  StickyNote,
  FileText,
  BookOpen,
  MessagesSquare,
  Settings,
  Sun,
  Moon,
  Grid2X2,
  type LucideIcon,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { useTheme } from 'next-themes';

// ─── Command types ────────────────────────────────────────────────────────

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: '导航' | '会话' | '功能' | '操作';
  keywords?: string;
  action: () => void;
}

// ─── Static feature / action commands ─────────────────────────────────────

function useStaticCommands(close: () => void): Command[] {
  const {
    setActiveFeatureView,
    setCreateNewPanelOpen,
    setSettingsPanelOpen,
    setSidebarOpen,
    setCoursePanelOpen,
    sidebarOpen,
  } = useLearningStore();
  const { setTheme, theme } = useTheme();

  const run = useCallback((fn: () => void) => () => {
    fn();
    close();
  }, [close]);

  return useMemo<Command[]>(() => {
    const cmds: Command[] = [
      // ── Navigation ──
      {
        id: 'nav-chat',
        label: '返回对话',
        hint: '回到当前会话的聊天界面',
        icon: MessagesSquare,
        group: '导航',
        keywords: 'chat back return 对话 返回 聊天',
        action: run(() => setActiveFeatureView(null)),
      },
      {
        id: 'nav-sessions',
        label: '查看学习主题列表',
        hint: '聚焦侧边栏',
        icon: BookOpen,
        group: '导航',
        keywords: 'sessions sidebar list 主题 列表 侧边栏',
        action: run(() => setSidebarOpen(true)),
      },
      // ── Features (mirror More Features panel) ──
      {
        id: 'feat-tasks',
        label: '任务规划',
        hint: '制定学习计划，分解学习目标',
        icon: ListChecks,
        group: '功能',
        keywords: 'tasks plan 任务 计划',
        action: run(() => setActiveFeatureView('tasks')),
      },
      {
        id: 'feat-cards',
        label: '学习卡片',
        hint: '创建闪卡，主动回忆与间隔重复',
        icon: CreditCard,
        group: '功能',
        keywords: 'cards flashcard 卡片 闪卡',
        action: run(() => setActiveFeatureView('cards')),
      },
      {
        id: 'feat-progress',
        label: '学习进度',
        hint: '成就徽章与学习统计：连续学习、复习进度、本周活动',
        icon: Trophy,
        group: '功能',
        keywords: 'progress achievements stats trophy 成就 统计 进度 数据 徽章',
        action: run(() => setActiveFeatureView('progress')),
      },
      {
        id: 'feat-graph',
        label: '知识图谱',
        hint: '构建知识网络图',
        icon: Network,
        group: '功能',
        keywords: 'graph knowledge network 图谱 知识 网络',
        action: run(() => setActiveFeatureView('graph')),
      },
      {
        id: 'feat-notes',
        label: '学习笔记',
        hint: '富文本笔记，支持公式与代码',
        icon: StickyNote,
        group: '功能',
        keywords: 'notes 笔记',
        action: run(() => setActiveFeatureView('notes')),
      },
      {
        id: 'feat-materials',
        label: '文件导入',
        hint: '导入学习资料构建知识库，AI 将基于资料定制对话与课程',
        icon: FileText,
        group: '功能',
        keywords: 'materials import upload files 资料 文件 导入 上传 知识库',
        action: run(() => setActiveFeatureView('materials')),
      },
      // ── Session ──
      {
        id: 'sess-new',
        label: '创建新学习主题',
        hint: '新建一个对话式学习会话',
        icon: Plus,
        group: '会话',
        keywords: 'new create session topic 新建 创建 主题',
        action: run(() => {
          setSidebarOpen(true);
        }),
      },
      // ── Actions ──
      {
        id: 'act-course',
        label: '打开课程面板',
        hint: '查看或生成本主题的结构化课程',
        icon: BookOpen,
        group: '操作',
        keywords: 'course lesson module curriculum 课程 模块 教程',
        action: run(() => setCoursePanelOpen(true)),
      },
      {
        id: 'act-more',
        label: '打开功能面板',
        hint: '展开更多功能浮层',
        icon: Grid2X2,
        group: '操作',
        keywords: 'more features panel 功能 面板',
        action: run(() => setCreateNewPanelOpen(true)),
      },
      {
        id: 'act-settings',
        label: '显示设置',
        hint: '字号、密度、主题模式等',
        icon: Settings,
        group: '操作',
        keywords: 'settings display preferences 设置 显示 偏好',
        action: run(() => setSettingsPanelOpen(true)),
      },
      {
        id: 'act-theme',
        label: theme === 'dark' ? '切换到浅色模式' : '切换到深色模式',
        hint: '切换主题',
        icon: theme === 'dark' ? Sun : Moon,
        group: '操作',
        keywords: 'theme dark light 主题 深色 浅色 dark light',
        action: run(() => setTheme(theme === 'dark' ? 'light' : 'dark')),
      },
      {
        id: 'act-toggle-sidebar',
        label: sidebarOpen ? '折叠侧边栏' : '展开侧边栏',
        hint: '切换侧边栏显隐',
        icon: BookOpen,
        group: '操作',
        keywords: 'sidebar toggle collapse 侧边栏 折叠',
        action: run(() => setSidebarOpen(!sidebarOpen)),
      },
    ];
    return cmds;
  }, [setActiveFeatureView, setCreateNewPanelOpen, setSettingsPanelOpen, setSidebarOpen, setCoursePanelOpen, sidebarOpen, setTheme, theme, run]);
}

// ─── Session commands (dynamic) ───────────────────────────────────────────

function useSessionCommands(query: string, close: () => void): Command[] {
  const { sessions, selectSession } = useLearningStore();

  return useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? sessions.filter(
          s =>
            s.title.toLowerCase().includes(q) ||
            (s.topic || '').toLowerCase().includes(q),
        )
      : sessions;
    return filtered.slice(0, 6).map(s => ({
      id: `sess-${s.id}`,
      label: s.title,
      hint: s.topic || (s.status === 'completed' ? '已完成' : '进行中'),
      icon: BookOpen,
      group: '会话',
      keywords: s.title + ' ' + (s.topic || ''),
      action: () => {
        selectSession(s.id);
        close();
      },
    }));
  }, [sessions, query, selectSession, close]);
}

// ─── Highlighted match ────────────────────────────────────────────────────

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-neutral-200/80 px-0.5 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ─── Command Palette ───────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Global hotkey: ⌘K / Ctrl+K to open, Esc to close ──
  // Reset query/active index together with opening so we don't need a
  // setState-in-effect.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(o => {
          if (!o) {
            setQuery('');
            setActiveIdx(0);
            requestAnimationFrame(() => inputRef.current?.focus());
          }
          return !o;
        });
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const staticCmds = useStaticCommands(close);
  const sessionCmds = useSessionCommands(query, close);

  // Merge: session matches first (most actionable when searching), then static.
  const commands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...sessionCmds, ...staticCmds];
    if (!q) return all;
    return all.filter(c => {
      const hay = (c.label + ' ' + (c.hint || '') + ' ' + (c.keywords || '') + ' ' + c.group).toLowerCase();
      return hay.includes(q);
    });
  }, [sessionCmds, staticCmds, query]);

  // Keep active item in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, commands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = commands[activeIdx];
        if (cmd) cmd.action();
      }
    },
    [commands, activeIdx],
  );

  // Group commands for display, preserving filtered order
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of commands) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    // Assign flat indices for keyboard nav
    let flat = 0;
    for (const arr of map.values()) {
      for (const c of arr) {
        (c as Command & { __flat: number }).__flat = flat++;
      }
    }
    return Array.from(map.entries());
  }, [commands]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // EXIT EASING (anim-refine-003): ease-out so the palette visibly
          // fades from frame 1 (no dead-time window).
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Backdrop — solid dark overlay (no backdrop-blur to avoid the
              124ms main-thread stall on close that backdrop-filter teardown
              causes — see settings-view.tsx comment + worklog anim-refine-003). */}
          <div
            className="absolute inset-0 bg-neutral-100/80 dark:bg-neutral-950/80"
            onClick={close}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: MOTION.enter }}
            exit={{ opacity: 0, y: -12, scale: 0.98, transition: MOTION.enter }}
            className="relative w-[min(560px,92vw)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {/* Input row */}
            <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="搜索会话或功能…"
                className="flex-1 border-0 bg-transparent text-[14px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
              <kbd className="hidden items-center rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] text-neutral-400 sm:flex dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              className="max-h-[52vh] overflow-y-auto custom-scrollbar p-1.5"
            >
              {commands.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-[13px] text-neutral-400">没有匹配的结果</p>
                  <p className="mt-1 text-[11px] text-neutral-400/70">
                    试试输入「主题」「笔记」「成就」或主题名
                  </p>
                </div>
              )}

              {groups.map(([group, cmds]) => (
                <div key={group} className="mb-1.5 last:mb-0">
                  <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {group}
                  </div>
                  {cmds.map(c => {
                    const flat = (c as Command & { __flat: number }).__flat;
                    const isActive = flat === activeIdx;
                    return (
                      <button
                        key={c.id}
                        data-idx={flat}
                        onMouseMove={() => setActiveIdx(flat)}
                        onClick={c.action}
                        className={`group relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-100 ${
                          isActive
                            ? 'bg-neutral-100 dark:bg-neutral-800'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                        }`}
                      >
                        {/* Active indicator bar — uses layoutId so it SLIDES
                            between buttons instead of teleporting. Matches
                            the settings-view tab pill technique. */}
                        {isActive && (
                          <motion.span
                            layoutId="cmd-active-bar"
                            className="pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-neutral-400 dark:bg-neutral-500"
                            transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
                          />
                        )}
                        <c.icon className="h-4 w-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600 dark:group-hover:text-neutral-300" />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                            {highlight(c.label, query)}
                          </span>
                          {c.hint && (
                            <span className="block truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                              {c.hint}
                            </span>
                          )}
                        </span>
                        {isActive && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
              <div className="flex items-center gap-3 text-[10px] text-neutral-400 dark:text-neutral-500">
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  <ArrowDown className="h-3 w-3" />
                  导航
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" />
                  选中
                </span>
              </div>
              <span className="font-serif text-[11px] text-neutral-400 dark:text-neutral-500">
                MindGuide · 命令面板
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
