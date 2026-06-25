'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Loader2, BookOpen, GraduationCap, Sparkles, Send, Square } from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { KnowledgeInline } from '@/components/learning/knowledge-inline';
import { MarkdownRenderer, CopyAllButton } from '@/components/learning/markdown-renderer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  const now = new Date();
  const date = new Date(d);
  if (date.toDateString() === now.toDateString()) return '今天';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return '昨天';
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
}

// ─── Animation Variants ─────────────────────────────────────────────────────

const msgVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
};

const dateSepVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25 } },
};

const streamingBubbleVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

const emptyStateVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { delay: 0.15, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

const knowledgeVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

const welcomeVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.45, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ─── Component ───────────────────────────────────────────────────────────────

export function MainContent() {
  const {
    currentSessionId,
    sessions,
    messages,
    isLoadingMessages,
    isStreaming,
    streamingContent,
    knowledgeNodes,
    sendMessage,
  } = useLearningStore();

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const session = sessions.find(s => s.id === currentSessionId);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = useCallback(async () => {
    const t = input.trim();
    if (!t || isStreaming) return;
    setInput('');
    await sendMessage(t);
  }, [input, isStreaming, sendMessage]);

  const handleStop = useCallback(() => {
    useLearningStore.setState({ isStreaming: false, streamingContent: '' });
  }, []);

  // ── No session selected: welcome screen ──
  if (!currentSessionId) {
    return <WelcomeView />;
  }

  // ── Loading ──
  if (isLoadingMessages) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div
          className="h-5 w-5 rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-600 dark:border-t-neutral-200"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        />
      </div>
    );
  }

  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const lastMsgRole = messages[messages.length - 1]?.role;

  // ── Chat view ──
  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Chat header */}
      <div className="relative z-[41] flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-6 dark:border-neutral-800">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-medium text-neutral-900 dark:text-neutral-100">
            {session?.title || '学习中'}
          </h1>
          <p className="text-[12px] text-neutral-400">{userMsgCount} 条对话</p>
        </div>
        <div className="flex items-center gap-1">
          <AnimatePresence mode="wait">
            {isStreaming && (
              <motion.div
                key="streaming-indicator"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2 px-2 text-[12px] text-neutral-400"
              >
                <motion.div
                  className="h-1.5 w-1.5 rounded-full bg-neutral-400"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                />
                思考中
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => useLearningStore.getState().setSettingsPanelOpen(!useLearningStore.getState().settingsPanelOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <MoreVertical className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[720px] px-6 py-4">
          <AnimatePresence>
            {messages.length === 0 && !isStreaming && (
              <motion.div
                key="empty-state"
                variants={emptyStateVariants}
                initial="hidden"
                animate="visible"
                className="py-20 text-center"
              >
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                  <Sparkles className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
                </div>
                <p className="text-[14px] text-neutral-400">
                  开始和 AI 交流，聊聊你想学什么
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const showDate = idx === 0 || !(
                new Date(msg.createdAt).toDateString() === new Date(messages[idx - 1].createdAt).toDateString()
              );
              return (
                <React.Fragment key={msg.id}>
                  {showDate && (
                    <motion.div
                      variants={dateSepVariants}
                      initial="hidden"
                      animate="visible"
                      className="my-6 flex items-center gap-3"
                    >
                      <div className="flex-1 border-t border-neutral-100 dark:border-neutral-800" />
                      <span className="text-[11px] text-neutral-400">{fmtDate(msg.createdAt)}</span>
                      <div className="flex-1 border-t border-neutral-100 dark:border-neutral-800" />
                    </motion.div>
                  )}
                  <motion.div variants={msgVariants} initial="hidden" animate="visible">
                    <MsgBubble msg={msg} />
                  </motion.div>
                </React.Fragment>
              );
            })}
          </AnimatePresence>

          {/* Streaming response */}
          <AnimatePresence>
            {isStreaming && lastMsgRole !== 'assistant' && streamingContent && (
              <motion.div
                variants={streamingBubbleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="my-3 flex gap-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] text-white dark:bg-white dark:text-neutral-900">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  >
                    <Loader2 className="h-3 w-3" />
                  </motion.div>
                </div>
                <div className="group relative min-w-0 max-w-[85%] rounded-xl rounded-tl-sm bg-neutral-100 px-3.5 py-2.5 text-[14px] leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  <MarkdownRenderer content={streamingContent} streaming />
                  <motion.span
                    className="ml-0.5 inline-block h-3.5 w-0.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Knowledge nodes inline */}
          <AnimatePresence>
            {knowledgeNodes.length > 0 && !isStreaming && messages.length > 0 && (
              <motion.div
                key="knowledge-panel"
                variants={knowledgeVariants}
                initial="hidden"
                animate="visible"
                className="my-8"
              >
                <KnowledgeInline nodes={knowledgeNodes} />
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Simple Chat Input */}
      <div className="shrink-0 border-t border-neutral-200/50 px-6 pb-6 pt-4">
        <div className="mx-auto max-w-[680px]">
          <SimpleChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={handleStop}
            isStreaming={isStreaming}
            placeholder="输入消息..."
          />
        </div>
      </div>
    </div>
  );
}

// ─── Simple Chat Input ──────────────────────────────────────────────────────

function SimpleChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  placeholder = '输入消息...',
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming) onSend();
    }
  }, [value, isStreaming, onSend]);

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="flex items-end gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 transition-colors focus-within:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-neutral-600">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isStreaming}
        rows={1}
        className="flex-1 resize-none border-0 bg-transparent py-1 text-[14px] leading-relaxed text-neutral-800 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50 dark:text-neutral-200 dark:placeholder:text-neutral-500"
      />
      <AnimatePresence mode="wait">
        {isStreaming ? (
          <motion.button
            key="stop"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-600 text-white transition-colors hover:bg-neutral-500 dark:bg-neutral-400 dark:text-neutral-900"
          >
            <Square className="h-3 w-3 fill-current" />
          </motion.button>
        ) : (
          <motion.button
            key="send"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            onClick={canSend ? onSend : undefined}
            disabled={!canSend}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              canSend
                ? 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100'
                : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MsgBubble({ msg }: { msg: { role: string; content: string; createdAt: string } }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`my-3 flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
        isUser
          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
      }`}>
        {isUser ? '我' : 'AI'}
      </div>
      <div className={`group relative min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
        isUser
          ? 'rounded-tr-sm bg-neutral-900 text-neutral-100 dark:bg-white dark:text-neutral-900'
          : 'rounded-tl-sm bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <>
            <MarkdownRenderer content={msg.content} />
            <div className="absolute -top-2 right-2 hidden group-hover:flex">
              <CopyAllButton content={msg.content} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Welcome View ─────────────────────────────────────────────────────────────

function WelcomeView() {
  const { createSession } = useLearningStore();
  const [topicInput, setTopicInput] = useState('');

  const topics = [
    { label: '机器学习基础', icon: '🧠' },
    { label: 'JavaScript 异步', icon: '⚡' },
    { label: '数据结构与算法', icon: '🏗' },
    { label: '设计模式', icon: '🎨' },
    { label: '计算机网络', icon: '🌐' },
  ];

  const handleSubmit = useCallback(async (value?: string) => {
    const t = (value || topicInput).trim();
    if (!t) return;
    setTopicInput('');
    await createSession(t);
  }, [topicInput, createSession]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto custom-scrollbar">
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-[560px] text-center">
          {/* Logo */}
          <motion.div
            custom={0}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mb-8 mx-auto flex h-[56px] w-[56px] items-center justify-center rounded-[20px] bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
          >
            <GraduationCap className="h-7 w-7" strokeWidth={1.8} />
          </motion.div>

          {/* Title */}
          <motion.h1
            custom={1}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mb-3 text-[28px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            MindGuide
          </motion.h1>

          <motion.p
            custom={2}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mb-10 text-[15px] leading-relaxed text-neutral-400"
          >
            输入一个学习主题，开始你的 AI 学习之旅
          </motion.p>

          {/* Simple topic input */}
          <motion.div
            custom={3}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mb-10"
          >
            <div className="mx-auto flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 transition-colors focus-within:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-neutral-600">
              <BookOpen className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                type="text"
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="输入你想学的主题..."
                className="flex-1 border-0 bg-transparent py-0.5 text-[14px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none dark:text-neutral-200 dark:placeholder:text-neutral-500"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSubmit()}
                disabled={!topicInput.trim()}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  topicInput.trim()
                    ? 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500'
                }`}
              >
                <Send className="h-3.5 w-3.5" />
              </motion.button>
            </div>
          </motion.div>

          {/* Quick Start Topics */}
          <motion.div
            custom={4}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
          >
            <p className="mb-4 text-[11px] font-medium tracking-[0.12em] text-neutral-400 uppercase dark:text-neutral-500">
              Quick Start
            </p>
          </motion.div>
          <motion.div
            custom={5}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap justify-center gap-2.5"
          >
            {topics.map((t, i) => (
              <motion.button
                key={t.label}
                custom={6 + i}
                variants={welcomeVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => createSession(t.label)}
                className="group flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/70 px-4 py-2 text-[13px] text-neutral-500 backdrop-blur-sm transition-all duration-200 hover:border-neutral-300 hover:bg-white hover:text-neutral-700 hover:shadow-sm dark:border-neutral-700/60 dark:bg-neutral-900/60 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              >
                <span className="text-[14px]">{t.icon}</span>
                <span>{t.label}</span>
              </motion.button>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
