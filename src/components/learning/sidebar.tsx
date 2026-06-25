'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MessagesSquare,
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Grid2X2,
  User,
} from 'lucide-react';
import { useLearningStore, type LearningSession } from '@/store/learning-store';
import { UnifiedSearch } from './unified-search';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ─── Animation Variants ─────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
};

const sessionVariants = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.03, duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  }),
  exit: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.15 } },
};

const createFormVariants = {
  hidden: { opacity: 0, height: 0, marginBottom: 0 },
  visible: { opacity: 1, height: 'auto', marginBottom: 8, transition: { type: 'spring', stiffness: 350, damping: 28 } },
  exit: { opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.15 } },
};

const sectionHeaderVariants = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
};

// ─── Collapsed Icon Strip ─────────────────────────────────────────────────

const iconStripVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.06, duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

function CollapsedSidebar() {
  const { setCoursePanelOpen, coursePanelOpen, setCreateNewPanelOpen } = useLearningStore();

  return (
    <aside className="flex h-full w-[56px] shrink-0 flex-col items-center bg-neutral-100 py-4 dark:bg-neutral-900">
      {/* Logo */}
      <motion.div
        custom={0}
        variants={iconStripVariants}
        initial="hidden"
        animate="visible"
        className="mb-6 flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
      >
        <MessagesSquare className="h-4 w-4" />
      </motion.div>

      {/* Icon buttons */}
      <motion.button
        custom={1}
        variants={iconStripVariants}
        initial="hidden"
        animate="visible"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setCoursePanelOpen(!coursePanelOpen)}
        className={`mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          coursePanelOpen
            ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
            : 'text-neutral-500 hover:bg-white/60 hover:text-neutral-700 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300'
        }`}
        title="课程"
      >
        <BookOpen className="h-4 w-4" />
      </motion.button>

      <motion.button
        custom={2}
        variants={iconStripVariants}
        initial="hidden"
        animate="visible"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setCreateNewPanelOpen(true)}
        className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/60 hover:text-neutral-700 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
        title="更多功能"
      >
        <Grid2X2 className="h-4 w-4" />
      </motion.button>

      <motion.button
        custom={3}
        variants={iconStripVariants}
        initial="hidden"
        animate="visible"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/60 hover:text-neutral-700 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
        title="搜索"
      >
        <Search className="h-4 w-4" />
      </motion.button>
    </aside>
  );
}

// ─── Full Sidebar ─────────────────────────────────────────────────────────

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) return <CollapsedSidebar />;
  return <FullSidebar />;
}

// ─── Full Sidebar ─────────────────────────────────────────────────────────

function FullSidebar() {
  const {
    sessions,
    currentSessionId,
    createSession,
    selectSession,
    deleteSession,
    updateSessionTitle,
    setCreateNewPanelOpen,
  } = useLearningStore();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'mine' | 'shared'>('mine');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const activeSessions = useMemo(() => sessions.filter(s => s.status === 'active'), [sessions]);
  const completedSessions = useMemo(() => sessions.filter(s => s.status === 'completed'), [sessions]);

  const filteredActive = useMemo(() => {
    if (!search.trim()) return activeSessions;
    const q = search.toLowerCase();
    return activeSessions.filter(s => s.title.toLowerCase().includes(q) || (s.topic || '').toLowerCase().includes(q));
  }, [activeSessions, search]);

  const filteredCompleted = useMemo(() => {
    if (!search.trim()) return completedSessions;
    const q = search.toLowerCase();
    return completedSessions.filter(s => s.title.toLowerCase().includes(q) || (s.topic || '').toLowerCase().includes(q));
  }, [completedSessions, search]);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    await createSession(newTitle.trim());
    setNewTitle('');
    setIsCreating(false);
  }, [newTitle, createSession]);

  const handleSaveEdit = useCallback(async (id: string) => {
    if (editTitle.trim()) await updateSessionTitle(id, editTitle.trim());
    setEditingId(null);
  }, [editTitle, updateSessionTitle]);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-neutral-100 dark:bg-neutral-900">
      {/* ── Top: Brand + Tabs ── */}
      <motion.div
        className="space-y-3 px-3 pt-4 pb-2"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Brand */}
        <motion.div className="flex items-center gap-2.5 px-1" variants={childVariants}>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <MessagesSquare className="h-3.5 w-3.5" />
          </div>
          <span className="text-[15px] font-semibold text-neutral-800 dark:text-neutral-100">MindGuide</span>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div className="flex gap-1 rounded-lg bg-neutral-200/70 p-0.5 dark:bg-neutral-800/70" variants={childVariants}>
          <button
            onClick={() => setActiveTab('mine')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-[6px] text-[12.5px] font-medium transition-all duration-200 ${
              activeTab === 'mine'
                ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            我的学习
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-[6px] text-[12.5px] font-medium transition-all duration-200 ${
              activeTab === 'shared'
                ? 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            分享的
          </button>
        </motion.div>
      </motion.div>

      {/* ── Unified Search ── */}
      <motion.div
        className="px-3 pb-2"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <UnifiedSearch
          value={search}
          onChange={setSearch}
          onResultClick={(result) => {
            if (result.sessionId) {
              selectSession(result.sessionId);
            }
          }}
        />
      </motion.div>

      {/* ── Create Topic (inline expand) ── */}
      <div className="px-3 pb-1">
        <AnimatePresence>
          {isCreating && (
            <motion.div
              className="mb-2 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
              variants={createFormVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="p-2.5">
                <input
                  type="text"
                  placeholder="输入学习主题..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
                  autoFocus
                  className="mb-2 h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-[13px] transition-colors duration-150 focus:border-neutral-300 focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)] dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200 dark:focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
                />
                <div className="flex justify-end gap-1.5">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsCreating(false)}
                    className="rounded-md px-2.5 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  >
                    取消
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCreate}
                    className="rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white dark:bg-white dark:text-neutral-900"
                  >
                    创建
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Session List ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2">
        {activeTab === 'mine' && (
          <>
            {/* Active Sessions */}
            {filteredActive.length > 0 && (
              <div className="mb-1">
                <motion.div
                  className="flex items-center justify-between px-2 py-1.5"
                  variants={sectionHeaderVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    进行中
                  </span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{filteredActive.length}</span>
                </motion.div>
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredActive.map((session, i) => (
                    <motion.div
                      key={session.id}
                      custom={i}
                      variants={sessionVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      layoutId={session.id}
                    >
                      <SessionRow
                        session={session}
                        isActive={session.id === currentSessionId}
                        isLoading={loadingSessionId === session.id}
                        isEditing={editingId === session.id}
                        editTitle={editTitle}
                        onSelect={() => {
                          setLoadingSessionId(session.id);
                          selectSession(session.id).finally(() => setLoadingSessionId(null));
                        }}
                        onStartEdit={() => { setEditingId(session.id); setEditTitle(session.title); }}
                        onEditTitleChange={setEditTitle}
                        onSaveEdit={() => handleSaveEdit(session.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onDelete={() => deleteSession(session.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Completed Sessions */}
            {filteredCompleted.length > 0 && (
              <div className="mb-1">
                <motion.div
                  className="flex items-center justify-between px-2 py-1.5"
                  variants={sectionHeaderVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    已完成
                  </span>
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{filteredCompleted.length}</span>
                </motion.div>
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredCompleted.map((session, i) => (
                    <motion.div
                      key={session.id}
                      custom={i}
                      variants={sessionVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      layoutId={session.id}
                    >
                      <SessionRow
                        session={session}
                        isActive={session.id === currentSessionId}
                        isLoading={loadingSessionId === session.id}
                        isEditing={editingId === session.id}
                        editTitle={editTitle}
                        onSelect={() => {
                          setLoadingSessionId(session.id);
                          selectSession(session.id).finally(() => setLoadingSessionId(null));
                        }}
                        onStartEdit={() => { setEditingId(session.id); setEditTitle(session.title); }}
                        onEditTitleChange={setEditTitle}
                        onSaveEdit={() => handleSaveEdit(session.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onDelete={() => deleteSession(session.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Empty state */}
            {filteredActive.length === 0 && filteredCompleted.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-12 text-center"
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-200/80 dark:bg-neutral-800">
                  <BookOpen className="h-4.5 w-4.5 text-neutral-400 dark:text-neutral-500" />
                </div>
                <p className="text-[12.5px] text-neutral-400 dark:text-neutral-500">
                  {search ? '没有匹配的主题' : '暂无学习主题'}
                </p>
                {!search && (
                  <p className="mt-1 text-[11px] text-neutral-400/70 dark:text-neutral-600">
                    点击下方按钮开始学习
                  </p>
                )}
              </motion.div>
            )}
          </>
        )}

        {activeTab === 'shared' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-12 text-center"
          >
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-200/80 dark:bg-neutral-800">
              <User className="h-4.5 w-4.5 text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[12.5px] text-neutral-400 dark:text-neutral-500">
              暂无分享内容
            </p>
            <p className="mt-1 text-[11px] text-neutral-400/70 dark:text-neutral-600">
              分享的学习主题会显示在这里
            </p>
          </motion.div>
        )}
      </div>

      {/* ── Bottom Actions ── */}
      <motion.div
        className="space-y-1.5 border-t border-neutral-200/80 px-3 pt-2.5 pb-3 dark:border-neutral-800/80"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        {/* Create New Topic - Primary Action */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsCreating(true)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 text-[13px] font-medium text-white shadow-sm transition-shadow hover:shadow-md dark:bg-white dark:text-neutral-900 dark:hover:shadow-lg"
        >
          <Plus className="h-4 w-4" />
          创建新主题
        </motion.button>

        {/* More Features - Secondary Action */}
        <button
          data-more-features-trigger
          onClick={(e) => {
            e.preventDefault();
            setCreateNewPanelOpen(true);
          }}
          className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white text-[13px] text-neutral-600 shadow-sm transition-colors duration-150 hover:bg-neutral-50 active:scale-[0.98] dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <Grid2X2 className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
          更多功能
        </button>
      </motion.div>
    </aside>
  );
}

// ─── Session Row ────────────────────────────────────────────────────────────────

function SessionRow({
  session,
  isActive,
  isLoading,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onEditTitleChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  session: LearningSession;
  isActive: boolean;
  isLoading: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditTitleChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const isCompleted = session.status === 'completed';

  return (
    <motion.div
      onClick={onSelect}
      whileTap={{ scale: 0.99 }}
      className={`group relative mb-0.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors duration-150 ${
        isActive
          ? 'bg-white shadow-sm dark:bg-neutral-800 dark:shadow-none'
          : 'hover:bg-white/60 dark:hover:bg-neutral-800/50'
      }`}
    >
      {/* Session icon / thumbnail — show inline spinner when loading */}
      <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
        isActive
          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          : isCompleted
          ? 'bg-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-500'
          : 'bg-neutral-200/60 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'
      }`}>
        {isLoading ? (
          <div className="h-4 w-4 rounded-full border-[1.5px] border-neutral-300 border-t-neutral-900 animate-spin dark:border-neutral-600 dark:border-t-white" />
        ) : (
          <BookOpen className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Title + time */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={editTitle}
              onChange={e => onEditTitleChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
              autoFocus
              className="h-7 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-[13px] transition-colors duration-150 focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,0,0,0.04)] dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200 dark:focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            />
            <motion.button whileTap={{ scale: 0.85 }} onClick={onSaveEdit}>
              <Check className="h-3.5 w-3.5 text-neutral-500" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={onCancelEdit}>
              <X className="h-3.5 w-3.5 text-neutral-500" />
            </motion.button>
          </div>
        ) : (
          <>
            <p className={`truncate text-[13px] leading-tight font-medium ${
              isActive
                ? 'text-neutral-800 dark:text-neutral-100'
                : isCompleted
                ? 'text-neutral-500 dark:text-neutral-500'
                : 'text-neutral-700 dark:text-neutral-300'
            }`}>
              {session.title}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-neutral-400 dark:text-neutral-600">
              {formatTime(session.updatedAt)}
            </p>
          </>
        )}
      </div>

      {/* Hover actions */}
      {!isEditing && (
        <motion.div
          className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 group-hover:opacity-100"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
        >
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={e => { e.stopPropagation(); onStartEdit(); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-200/80 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          >
            <Pencil className="h-3 w-3" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}