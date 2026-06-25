'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, BookOpen, GraduationCap, Send, Square, ArrowDown, Copy, Check } from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
import { KnowledgeInline } from '@/components/learning/knowledge-inline';
import { MarkdownRenderer } from '@/components/learning/markdown-renderer';
import { MouseFollowTooltip } from '@/components/learning/mouse-follow-tooltip';

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
    setCoursePanelOpen,
    coursePanelOpen,
    isCourseGenerated,
  } = useLearningStore();

  const [input, setInput] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const session = sessions.find(s => s.id === currentSessionId);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Track whether the user has scrolled up from the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distFromBottom > 200);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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
    <div className="relative flex h-full flex-1 flex-col">
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
                className="flex items-center gap-1.5 px-2 text-[12px] text-neutral-400"
              >
                {streamingContent ? (
                  <>
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-neutral-500"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ repeat: Infinity, duration: 0.9 }}
                    />
                    回复中
                  </>
                ) : (
                  <>
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-neutral-400"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                    />
                    思考中
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Course trigger — opens the course panel. Shows a tiny dot when a
              course has been generated for this session, so the user knows
              there's content to review. */}
          <MouseFollowTooltip
            content={isCourseGenerated ? '查看本主题的结构化课程' : '生成结构化课程'}
          >
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setCoursePanelOpen(!coursePanelOpen)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                coursePanelOpen
                  ? 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
              }`}
              aria-label="课程"
            >
              <BookOpen className="h-4 w-4" />
              {isCourseGenerated && !coursePanelOpen && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-neutral-700 dark:bg-neutral-300" />
              )}
            </motion.button>
          </MouseFollowTooltip>

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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
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
                  <BookOpen className="h-5 w-5 text-neutral-400 dark:text-neutral-500" strokeWidth={1.5} />
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

          {/* Thinking bubble — shown while waiting for the first streamed token */}
          <AnimatePresence>
            {isStreaming && !streamingContent && lastMsgRole !== 'assistant' && (
              <motion.div
                variants={streamingBubbleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="my-3 flex gap-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] text-white dark:bg-white dark:text-neutral-900">
                  <GraduationCap className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-1.5 rounded-xl rounded-tl-sm bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
                      animate={{
                        y: [0, -3, 0],
                        opacity: [0.4, 1, 0.4],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.9,
                        delay: dot * 0.15,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
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
                  <GraduationCap className="h-3.5 w-3.5" />
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

      {/* Scroll-to-bottom button — appears when the user has scrolled up */}
      <AnimatePresence>
        {showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={scrollToBottom}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            className="absolute bottom-[92px] left-1/2 z-30 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-500 shadow-sm backdrop-blur-sm transition-colors hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/95 dark:text-neutral-300 dark:hover:text-neutral-100"
            aria-label="滚动到最新消息"
          >
            <ArrowDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

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

function timeFmt(d: string) {
  const date = new Date(d);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function MsgBubble({ msg }: { msg: { role: string; content: string; createdAt: string } }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [msg.content]);

  return (
    <div className={`group/msg group flex items-end gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
        isUser
          ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
          : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
      }`}>
        {isUser ? '我' : 'AI'}
      </div>

      <div className={`flex min-w-0 max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`relative rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed transition-shadow duration-200 ${
          isUser
            ? 'rounded-tr-sm bg-neutral-900 text-neutral-100 dark:bg-white dark:text-neutral-900'
            : 'rounded-tl-sm bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
        }`}>
          {/* Subtle left accent on hover — thesis-style margin annotation cue */}
          <span
            aria-hidden
            className={`pointer-events-none absolute top-2 bottom-2 w-px bg-neutral-400/0 transition-colors duration-200 group-hover/msg:bg-neutral-400/40 ${
              isUser ? 'right-0' : 'left-0'
            }`}
          />
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <MarkdownRenderer content={msg.content} />
          )}
        </div>

        {/* Hover meta row: timestamp + copy */}
        <div
          className={`mt-1 flex items-center gap-2 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
            isUser ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <span className="font-sans text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
            {timeFmt(msg.createdAt)}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 font-sans text-[10px] text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            aria-label="复制消息"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                已复制
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                复制
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Welcome View ─────────────────────────────────────────────────────────────

function WelcomeView() {
  const { createSession } = useLearningStore();
  const [topicInput, setTopicInput] = useState('');

  const topics = [
    '机器学习基础',
    'JavaScript 异步',
    '数据结构与算法',
    '设计模式',
    '计算机网络',
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
          {/* Mark — a quiet monochrome wordmark instead of a colored logo */}
          <motion.div
            custom={0}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mx-auto mb-8 flex h-[56px] w-[56px] items-center justify-center rounded-[20px] border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <GraduationCap className="h-7 w-7" strokeWidth={1.5} />
          </motion.div>

          {/* Title — serif, scholarly */}
          <motion.h1
            custom={1}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mb-3 font-serif text-[30px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            MindGuide
          </motion.h1>

          <motion.p
            custom={2}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mb-10 text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400"
          >
            输入一个学习主题，开始你的 AI 学习之旅
          </motion.p>

          {/* Topic input */}
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

          {/* Quick Start — text-only suggestions, no icons */}
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
            {topics.map((label, i) => (
              <motion.button
                key={label}
                custom={6 + i}
                variants={welcomeVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => createSession(label)}
                className="rounded-md border border-neutral-200/80 bg-white/70 px-3.5 py-1.5 text-[13px] text-neutral-600 transition-colors duration-200 hover:border-neutral-300 hover:bg-white hover:text-neutral-900 dark:border-neutral-700/60 dark:bg-neutral-900/60 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                {label}
              </motion.button>
            ))}
          </motion.div>

          {/* Scholarly footnote — a quiet aphorism grounding the experience */}
          <motion.div
            custom={11}
            variants={welcomeVariants}
            initial="hidden"
            animate="visible"
            className="mt-14 flex flex-col items-center gap-1.5 text-neutral-400 dark:text-neutral-500"
          >
            <div className="h-px w-10 bg-neutral-200 dark:bg-neutral-700" />
            <p className="font-serif text-[11.5px] italic text-neutral-400 dark:text-neutral-500">
              “知识不是被给予的，而是被建构的。”
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-300 dark:text-neutral-600">
              — Jean Piaget
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
