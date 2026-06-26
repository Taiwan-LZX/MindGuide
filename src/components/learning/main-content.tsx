'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, BookOpen, GraduationCap, ArrowDown, Copy, Check, RefreshCw, Compass, Dumbbell, RotateCw, AlertCircle, X } from 'lucide-react';
import { MOTION } from '@/lib/motion-tokens';
import { useLearningStore } from '@/store/learning-store';
import { KnowledgeInline } from '@/components/learning/knowledge-inline';
import { MarkdownRenderer } from '@/components/learning/markdown-renderer';
import { MouseFollowTooltip } from '@/components/learning/mouse-follow-tooltip';
import { ChatComposer } from '@/components/learning/chat-composer';
import { useDraftInput, useInputHistory } from '@/hooks/use-draft-input';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  const now = new Date();
  const date = new Date(d);
  if (date.toDateString() === now.toDateString()) return '今天';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return '昨天';
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
}

// ─── Empty-state example questions (P10) ────────────────────────────────────
//
// Each example is tagged with the teaching mode it exercises, so the chip's
// icon doubles as a mode-teaching affordance — the user learns "引导模式 =
// Compass icon" by seeing it on a question they understand. The questions
// are deliberately short and concrete (not "Ask me anything!") so the user
// can imagine answering them.
const EXAMPLE_QUESTIONS: Array<{ text: string; mode: 'guide' | 'explain' | 'practice' | 'review' }> = [
  { text: '引导我理解贝叶斯定理', mode: 'guide' },
  { text: '讲解一下梯度下降', mode: 'explain' },
  { text: '出三道链表练习题', mode: 'practice' },
  { text: '复习昨天学的概念', mode: 'review' },
];

// ─── Animation Variants ─────────────────────────────────────────────────────
//
// Tactile ("手感") tuning:
//  - Message bubbles enter with a soft spring (stiffness 320, damping 30,
//    mass 0.7) so they "settle" into place — feels physical, not snapped.
//  - Date separators use a tiny spring scale-in for a quieter, more
//    deliberate beat between message groups.
//  - Streaming bubble + empty state + knowledge panel all switch from
//    linear duration easing to spring physics so the whole chat surface
//    shares one physical metaphor.
//  - Welcome cascade uses longer springs (mass 0.9, damping 26) for a
//    ceremonial, unhurried entrance.

const msgVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.7 },
  },
};

const dateSepVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 380, damping: 28, mass: 0.6 },
  },
};

const streamingBubbleVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.7 },
  },
  // EXIT = ENTER reversed: same target (hidden) + same spring. Symmetric.
  exit: {
    opacity: 0,
    y: 10,
    transition: MOTION.enter,
  },
};

const emptyStateVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.15, type: 'spring' as const, stiffness: 260, damping: 26, mass: 0.9 },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: [0.4, 0, 0.6, 1] as const },
  },
};

const knowledgeVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 240, damping: 26, mass: 0.9 },
  },
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
    streamingPhase,
    lastStreamError,
    knowledgeNodes,
    sendMessage,
    regenerateLastMessage,
    setCoursePanelOpen,
    coursePanelOpen,
    isCourseGenerated,
  } = useLearningStore();
  const thinkingMode = useLearningStore(s => s.thinkingMode);

  // Draft persistence — the composer's text is saved to localStorage on a
  // per-session basis so a page refresh or session switch doesn't lose the
  // half-written message. clearDraft is called after a successful send.
  const [input, setInput, clearDraft] = useDraftInput(currentSessionId);
  // Input history — ↑ recalls the previous sent message, ↓ cycles forward.
  // Terminal-style navigation for quick re-send / variation.
  const [inputHistory, pushHistory] = useInputHistory(currentSessionId);
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = not browsing history
  const savedDraftRef = useRef(''); // the draft the user had before pressing ↑
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [composerVisible, setComposerVisible] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);

  const session = sessions.find(s => s.id === currentSessionId);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Scroll-driven composer visibility — the composer floats above the thread
  // and auto-hides (slides down + fades) while the user scrolls DOWN to read
  // older messages, then pops back up the instant they scroll UP. Near the
  // bottom it stays pinned open so the user can always reply without fighting
  // the UI. Streaming + unsent draft text also pin it open.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const delta = el.scrollTop - lastScrollTopRef.current;

    if (distFromBottom < 72) {
      setComposerVisible(true);
    } else if (delta > 6) {
      setComposerVisible(false);
    } else if (delta < -6) {
      setComposerVisible(true);
    }

    lastScrollTopRef.current = el.scrollTop;
    setShowScrollBottom(distFromBottom > 200);
  }, []);

  // The composer is also force-pinned open while the model is streaming or
  // there's unsent draft text — we don't want to hide the input the user is
  // actively using. This is derived at render time (no effect) so it can't
  // trigger cascading renders.
  const composerPinnedOpen = isStreaming || input.trim().length > 0;
  const showComposer = composerVisible || composerPinnedOpen;

  // ── P10: Dynamic empty-state subtitle + placeholder ──
  //
  // When the session has unmastered knowledge nodes, the empty-state subtitle
  // and the placeholder both nudge the user toward one of them — the learner
  // is closest to mastering something they've already started. Otherwise fall
  // back to a generic prompt. This makes the placeholder feel alive rather
  // than boilerplate.
  const unmasteredNode = knowledgeNodes.find(n => !n.mastered);
  const emptyStateSubtitle = unmasteredNode
    ? `试试问「${unmasteredNode.title}」— 你上次还没掌握`
    : '在下方输入框输入你的问题，聊聊你想学什么';
  const dynamicPlaceholder = unmasteredNode
    ? `问我「${unmasteredNode.title}」，或任何学习上的问题…`
    : '问我任何学习上的问题…';

  // ── P7: Stream-error toast ──
  //
  // When lastStreamError transitions from null → string, show a toast for
  // 3.5s then clear it (so the same error doesn't re-show on re-render).
  // Uses a ref to track the "last shown" error so a repeat of the same
  // message after dismissal still re-triggers.
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const lastShownError = useRef<string | null>(null);
  useEffect(() => {
    if (lastStreamError && lastStreamError !== lastShownError.current) {
      lastShownError.current = lastStreamError;
      // Deferred to a microtask so we don't call setState synchronously inside
      // this effect (react-hooks/set-state-in-effect rule).
      queueMicrotask(() => setErrorToast(lastStreamError));
      const t = setTimeout(() => {
        queueMicrotask(() => setErrorToast(null));
        // Clear the store flag too so re-sending doesn't re-trigger.
        useLearningStore.setState({ lastStreamError: null });
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [lastStreamError]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = useCallback(async (overrideText?: string) => {
    const t = (overrideText ?? input).trim();
    if (!t || isStreaming) return;
    // Push to input history (for ↑ recall) and clear the persisted draft.
    pushHistory(t);
    setHistoryIndex(-1);
    clearDraft();
    setInput('');
    await sendMessage(t);
  }, [input, isStreaming, sendMessage, pushHistory, clearDraft, setInput]);

  // ── Input history navigation (↑ / ↓) ──────────────────────────────────────
  // Terminal-style recall: when the composer is empty (or the user has
  // already started browsing history), pressing ↑ replaces the draft with
  // the previous sent message. ↓ cycles back toward the most recent. Once
  // the user goes past the newest entry, their original draft is restored.
  const navigateHistory = useCallback((dir: 'up' | 'down') => {
    if (inputHistory.length === 0) return;
    if (dir === 'up') {
      // Save the current draft the first time we enter history-browsing
      // mode, so ↓ past the end restores it.
      if (historyIndex === -1) {
        savedDraftRef.current = input;
      }
      const nextIdx = historyIndex === -1 ? 0 : Math.min(historyIndex + 1, inputHistory.length - 1);
      setHistoryIndex(nextIdx);
      setInput(inputHistory[nextIdx]);
    } else {
      if (historyIndex === -1) return; // not browsing history, nothing to do
      const nextIdx = historyIndex - 1;
      if (nextIdx < 0) {
        // Past the newest entry — restore the original draft.
        setHistoryIndex(-1);
        setInput(savedDraftRef.current);
      } else {
        setHistoryIndex(nextIdx);
        setInput(inputHistory[nextIdx]);
      }
    }
  }, [inputHistory, historyIndex, input, setInput]);

  // Reset history browsing state when the user manually edits (types /
  // pastes) the input — they've left "history mode" and ↑ should start
  // fresh from the most recent entry next time.
  const handleInputChange = useCallback((v: string) => {
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
    }
    setInput(v);
  }, [historyIndex, setInput]);

  const handleStop = useCallback(() => {
    useLearningStore.setState({
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      streamingPhase: null,
    });
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
      {/* ── P7: Stream-error toast — fixed at top-center of the chat area ── */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } }}
            exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.16 } }}
            className="absolute left-1/2 top-2 z-[60] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[12px] text-neutral-700 shadow-lg dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
            {errorToast}
            <button
              type="button"
              onClick={() => setErrorToast(null)}
              className="ml-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
              aria-label="关闭"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat header — the inner row is constrained to the same max-width as
          the message thread + input bar, so the title's left edge aligns
          perfectly with the first message bubble below it (no stair-step). */}
      <div className="relative z-[41] flex h-14 shrink-0 items-center border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between px-6">
          <div className="flex min-w-0 flex-col justify-center leading-tight">
            <h1 className="truncate text-[15px] font-medium text-neutral-900 dark:text-neutral-100">
              {session?.title || '学习中'}
            </h1>
            <p className="text-[11.5px] text-neutral-400 dark:text-neutral-500">{userMsgCount} 条对话</p>
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
              whileHover={{
                scale: 1.06,
                transition: { type: 'spring', stiffness: 400, damping: 22 },
              }}
              whileTap={{
                scale: 0.94,
                transition: { type: 'spring', stiffness: 600, damping: 25 },
              }}
              onClick={() => setCoursePanelOpen(!coursePanelOpen)}
              data-course-toggle
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

          <MouseFollowTooltip content="显示选项 · 主题与动态效果">
            <motion.button
              whileHover={{
                scale: 1.06,
                transition: { type: 'spring', stiffness: 400, damping: 22 },
              }}
              whileTap={{
                scale: 0.94,
                transition: { type: 'spring', stiffness: 600, damping: 25 },
              }}
              onClick={() => useLearningStore.getState().setSettingsPanelOpen(!useLearningStore.getState().settingsPanelOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label="显示选项"
            >
              <MoreVertical className="h-4 w-4" />
            </motion.button>
          </MouseFollowTooltip>
        </div>
        </div>
      </div>

      {/* Messages — extra bottom padding (pb-44) reserves room for the
          floating composer so the last bubble can scroll clear of it. */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        <div className="mx-auto max-w-[720px] space-y-5 px-6 py-5 pb-44">
          <AnimatePresence>
            {messages.length === 0 && !isStreaming && (
              <motion.div
                key="empty-state"
                variants={emptyStateVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex flex-col items-center py-24 text-center"
              >
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 ring-1 ring-neutral-200/60 dark:bg-neutral-800 dark:ring-neutral-700/60">
                  <GraduationCap className="h-6 w-6 text-neutral-400 dark:text-neutral-500" strokeWidth={1.5} />
                </div>
                <p className="text-[15px] font-medium text-neutral-600 dark:text-neutral-300">
                  开始和 AI 交流
                </p>
                <p className="mt-1.5 text-[13px] text-neutral-400 dark:text-neutral-500">
                  {emptyStateSubtitle}
                </p>
                {/* Example question chips — scaffold the first turn by offering
                    3-4 example questions, each mapped to a teaching mode so the user
                    also learns what each mode is FOR. */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {EXAMPLE_QUESTIONS.map(q => (
                    <motion.button
                      key={q.text}
                      type="button"
                      onClick={() => handleSend(q.text)}
                      whileHover={{ scale: 1.03, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
                      whileTap={{ scale: 0.97 }}
                      className="group flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    >
                      <span className="text-neutral-400 transition-colors group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300">
                        {q.mode === 'guide' ? <Compass className="h-3 w-3" /> : q.mode === 'explain' ? <GraduationCap className="h-3 w-3" /> : q.mode === 'practice' ? <Dumbbell className="h-3 w-3" /> : <RotateCw className="h-3 w-3" />}
                      </span>
                      {q.text}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const showDate = idx === 0 || !(
                new Date(msg.createdAt).toDateString() === new Date(messages[idx - 1].createdAt).toDateString()
              );
              const isLast = idx === messages.length - 1;
              const isLastAssistant = isLast && msg.role === 'assistant' && !isStreaming;
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
                    <MsgBubble
                      msg={msg}
                      isLastAssistant={isLastAssistant}
                      onRegenerate={regenerateLastMessage}
                    />
                  </motion.div>
                </React.Fragment>
              );
            })}
          </AnimatePresence>

          {/* Thinking bubble — shown while the model is in its reasoning phase
              (streamingPhase === 'thinking') OR during the pre-first-token gap
              (streamingPhase === null && no content yet). The phase signal is
              AUTHORITATIVE — it stays 'thinking' for the whole reasoning trace,
              so the animation persists correctly instead of flashing off the
              instant the first reasoning token arrives. */}
          <AnimatePresence>
            {isStreaming && (streamingPhase === 'thinking' || (!streamingContent && !streamingPhase)) && lastMsgRole !== 'assistant' && (
              <motion.div
                variants={streamingBubbleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="my-1 flex flex-col gap-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200/60 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700/60">
                    <GraduationCap className="h-3 w-3" strokeWidth={2} />
                  </span>
                  <span className="text-[11.5px] font-medium text-neutral-500 dark:text-neutral-400">MindGuide</span>
                  {streamingPhase === 'thinking' && (
                    <span className="ml-1 rounded-full border border-neutral-200 px-1.5 py-px text-[9.5px] text-neutral-400 dark:border-neutral-700 dark:text-neutral-500">
                      推理中
                    </span>
                  )}
                </div>
                <ThreadThinkingAnim mode={thinkingMode} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Streaming response — no bubble, flowing markdown with a block caret
              at the live edge. Reads like the agent is typing into the thread. */}
          <AnimatePresence>
            {isStreaming && lastMsgRole !== 'assistant' && streamingContent && (
              <motion.div
                variants={streamingBubbleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="my-1 flex flex-col gap-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200/60 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700/60">
                    <GraduationCap className="h-3 w-3" strokeWidth={2} />
                  </span>
                  <span className="text-[11.5px] font-medium text-neutral-500 dark:text-neutral-400">MindGuide</span>
                </div>
                <div className="min-w-0 text-[13.5px] leading-[1.7] text-neutral-800 dark:text-neutral-200">
                  <MarkdownRenderer content={streamingContent} streaming />
                  <motion.span
                    className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] rounded-[1px] bg-neutral-500 align-text-bottom dark:bg-neutral-300"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
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

      {/* Scroll-to-bottom button — appears when the user has scrolled up. Its
          vertical position tracks the composer: it hovers just above the
          composer when it's visible, and drops to the bottom edge when the
          composer has slid away, so it never collides with the input. */}
      <AnimatePresence>
        {showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }}
            onClick={scrollToBottom}
            whileHover={{
              scale: 1.08,
              transition: { type: 'spring', stiffness: 400, damping: 22 },
            }}
            whileTap={{
              scale: 0.92,
              transition: { type: 'spring', stiffness: 600, damping: 25 },
            }}
            style={{ bottom: showComposer ? 124 : 24 }}
            className="absolute left-1/2 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-500 shadow-sm backdrop-blur-sm transition-[bottom] duration-300 ease-out hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/95 dark:text-neutral-300 dark:hover:text-neutral-100"
            aria-label="滚动到最新消息"
          >
            <ArrowDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Composer — floats above the thread and slides out of view (down +
          fade) when the user scrolls down to read, so the reading surface stays
          unobstructed. A soft gradient backdrop lets bubbles fade out
          gracefully under it. */}
      <motion.div
        animate={{
          y: showComposer ? 0 : '115%',
          opacity: showComposer ? 1 : 0,
        }}
        transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40"
      >
        <div className="pointer-events-auto bg-gradient-to-t from-white via-white/95 to-transparent pb-5 pt-10 dark:from-neutral-950 dark:via-neutral-950/95 dark:to-transparent">
          <div className="mx-auto max-w-[720px] px-6">
            <ChatComposer
              value={input}
              onChange={handleInputChange}
              onSend={handleSend}
              onStop={handleStop}
              onNavigateHistory={navigateHistory}
              isStreaming={isStreaming}
              isThinking={isStreaming && (streamingPhase === 'thinking' || (!streamingContent && !streamingPhase))}
              placeholder={dynamicPlaceholder}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}


// ─── Message Bubble ──────────────────────────────────────────────────────────
//
// Display follows the ZCode (zcode.z.ai) message surface:
//
//   • User messages are right-aligned, bordered surface chips with an
//     asymmetric top-right corner (rounded-tr-xs = the chat "tail"). No
//     avatar — right-alignment + the tail is enough identity. (ZCode uses
//     max-w-xl; we use max-w-[85%] to stay readable on narrow threads.)
//
//   • Assistant messages have NO bubble — the markdown flows directly in a
//     space-y-4 column, like an IDE agent's prose. A tiny inline header
//     (GraduationCap + "MindGuide") marks the teacher identity without
//     adding visual weight. This is the "programming-IDE base, teaching skin"
//     the user asked for: code-agent layout, learning content.
//
//   • Base font is 13.5px (ZCode uses 13px; we nudge up half a point for
//     Chinese legibility). Code blocks & tables keep their own sizes.
//
//   • Hover reveals a footer action row: timestamp (always) + copy (always) +
//     regenerate (only on the last assistant turn). Actions use a soft spring
//     so the toolbar emerges rather than pops.

function timeFmt(d: string) {
  const date = new Date(d);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function ActionButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <MouseFollowTooltip content={label}>
      <motion.button
        whileHover={{ scale: 1.08, transition: { type: 'spring', stiffness: 400, damping: 20 } }}
        whileTap={{ scale: 0.9, transition: { type: 'spring', stiffness: 600, damping: 25 } }}
        onClick={onClick}
        aria-label={label}
        className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
      >
        {children}
      </motion.button>
    </MouseFollowTooltip>
  );
}

function MsgBubble({
  msg,
  isLastAssistant = false,
  onRegenerate,
}: {
  msg: { role: string; content: string; createdAt: string };
  isLastAssistant?: boolean;
  onRegenerate?: () => void;
}) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [msg.content]);

  const handleRegenerate = useCallback(() => {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    onRegenerate();
  }, [onRegenerate, regenerating]);

  // ── User message: right-aligned bordered surface chip ──
  if (isUser) {
    return (
      <div className="group/msg flex w-full flex-col items-end gap-1.5">
        <div className="max-w-[85%] rounded-xl rounded-tr-xs border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13.5px] leading-[1.65] text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-100">
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
        {/* Footer — timestamp + copy, hover-revealed */}
        <div className="mr-1 flex items-center gap-1 px-1 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100">
          <span className="font-sans text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
            {timeFmt(msg.createdAt)}
          </span>
          <button
            onClick={handleCopy}
            className="flex h-5 items-center gap-1 rounded px-1 font-sans text-[10px] text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            aria-label="复制消息"
          >
            {copied ? <Check className="h-3 w-3 text-neutral-900 dark:text-neutral-100" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
    );
  }

  // ── Assistant message: no bubble, flowing markdown + inline teacher header ──
  return (
    <div className="group/msg flex flex-col gap-2">
      {/* Inline teacher identity — small, sits above the prose like an IDE
          agent's "model" label, but with the GraduationCap to mark this is a
          teaching response, not a code edit. */}
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200/60 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700/60">
          <GraduationCap className="h-3 w-3" strokeWidth={2} />
        </span>
        <span className="text-[11.5px] font-medium text-neutral-500 dark:text-neutral-400">MindGuide</span>
      </div>

      {/* Flowing markdown — no bubble background, just prose. space-y-* is
          handled inside MarkdownRenderer's element styles. */}
      <div className="min-w-0 text-[13.5px] leading-[1.7] text-neutral-800 dark:text-neutral-200">
        <MarkdownRenderer content={msg.content} />
      </div>

      {/* Footer action row — timestamp + copy + regenerate (last only) */}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100">
        <span className="mr-1 font-sans text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
          {timeFmt(msg.createdAt)}
        </span>
        <ActionButton onClick={handleCopy} label={copied ? '已复制' : '复制'}>
          {copied ? <Check className="h-3.5 w-3.5 text-neutral-900 dark:text-neutral-100" /> : <Copy className="h-3.5 w-3.5" />}
        </ActionButton>
        {isLastAssistant && onRegenerate && (
          <ActionButton onClick={handleRegenerate} label="重新生成">
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

// ─── Welcome View ─────────────────────────────────────────────────────────────
//
// A focus-first landing surface, modeled on ZCode's empty-conversation state:
// no brand mark, no title, no subtitle, no quick-start topic chips, no
// scholarly footnote. Just the same ChatComposer used inside a conversation,
// centered in the viewport, so the only thing vying for the user's attention
// is the act of asking. The app identity already lives in the sidebar; the
// quick-start topics will be relocated there in a later pass.

function WelcomeView() {
  const { createSession, sendMessage } = useLearningStore();
  const setSettingsPanelOpen = useLearningStore(s => s.setSettingsPanelOpen);
  // Welcome draft is persisted under the 'welcome' pseudo-session key so
  // the user's topic idea survives a refresh before they commit to creating
  // a session.
  const [input, setInput, clearDraft] = useDraftInput(null);

  // Sending from the welcome composer creates a new session from the draft
  // text and immediately fires it as the first user message, so the user
  // lands inside a live teaching conversation instead of an empty "0 条对话"
  // thread.
  const handleSubmit = useCallback(async () => {
    const t = input.trim();
    if (!t) return;
    clearDraft();
    setInput('');
    const session = await createSession(t);
    if (session) {
      await sendMessage(t);
    }
  }, [input, createSession, sendMessage, clearDraft, setInput]);

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      {/* Top bar — utility only (display-options entry), right-aligned so it
          sits in the same spot as the in-conversation header. No brand chrome. */}
      <div className="flex h-14 shrink-0 items-center justify-end px-6">
        <MouseFollowTooltip content="显示选项 · 主题与动态效果">
          <motion.button
            whileHover={{
              scale: 1.06,
              transition: { type: 'spring', stiffness: 400, damping: 22 },
            }}
            whileTap={{
              scale: 0.94,
              transition: { type: 'spring', stiffness: 600, damping: 25 },
            }}
            onClick={() => setSettingsPanelOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="显示选项"
          >
            <MoreVertical className="h-4 w-4" />
          </motion.button>
        </MouseFollowTooltip>
      </div>

      {/* Composer surface — a single, centered ChatComposer. Reusing the same
          component as the in-conversation input keeps the interaction contract
          (attach / mode / model / send) identical across both surfaces, so the
          user never has to learn a second input affordance. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26, mass: 0.9, delay: 0.05 }}
          className="w-full max-w-[720px]"
        >
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={handleSubmit}
            onStop={() => {}}
            isStreaming={false}
            placeholder="输入你想学的主题，开始学习…"
          />
        </motion.div>
      </div>
    </div>
  );
}

// ─── Thread thinking animation ───────────────────────────────────────────────
//
// Rendered inside the message thread's thinking bubble. Mirrors the
// StatusBackCard animations in chat-composer but sized for inline prose flow:
//   • off / standard — three-dot wave + "正在思考"
//   • deep           — orbiting electron around a solid neutral core + "深度推理中"
//   • structured     — three cascading tier chips (链式→批判→收敛) + "结构化推理中"
// Keeping a separate component here (rather than importing from chat-composer)
// avoids pulling composer-only dependencies into the thread render path.

type ThinkingMode = 'off' | 'standard' | 'deep' | 'structured';

function ThreadThinkingAnim({ mode }: { mode: ThinkingMode }) {
  if (mode === 'deep') return <ThreadDeepAnim />;
  if (mode === 'structured') return <ThreadStructuredAnim />;
  return <ThreadStandardAnim />;
}

function ThreadStandardAnim() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
          animate={{
            y: [0, -4, 0],
            opacity: [0.35, 1, 0.35],
            scale: [0.85, 1.1, 0.85],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.1,
            delay: dot * 0.16,
            ease: 'easeInOut',
          }}
        />
      ))}
      <span className="ml-1.5 font-sans text-[10.5px] text-neutral-400 dark:text-neutral-500">
        正在思考
      </span>
    </div>
  );
}

function ThreadDeepAnim() {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <motion.span
          className="absolute h-1.5 w-1.5 rounded-full bg-neutral-800 dark:bg-neutral-200"
          animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute h-4 w-4 rounded-full border border-neutral-400/60 dark:border-neutral-500/60"
          style={{ transform: 'rotateX(65deg)' }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
        />
        <motion.span
          className="absolute h-4 w-4 rounded-full border border-neutral-400/40 dark:border-neutral-500/40"
          style={{ transform: 'rotateY(65deg)' }}
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        />
        <motion.span
          className="absolute h-1 w-1 rounded-full bg-neutral-700 dark:bg-neutral-300"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
          style={{ transformOrigin: '0px 8px' }}
        />
      </span>
      <span className="font-sans text-[10.5px] text-neutral-500 dark:text-neutral-400">
        深度推理中
        <span className="ml-1 text-neutral-400 dark:text-neutral-500">· 多角度 · 反例检验</span>
      </span>
    </div>
  );
}

function ThreadStructuredAnim() {
  const tiers = ['链式', '批判', '收敛'];
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="flex items-center gap-1">
        {tiers.map((t, i) => (
          <motion.span
            key={t}
            className="flex h-4 items-center gap-0.5 rounded-full border border-neutral-300/70 bg-white px-1 text-[8.5px] font-medium text-neutral-500 dark:border-neutral-600/70 dark:bg-neutral-800 dark:text-neutral-400"
            animate={{
              opacity: [0.35, 1, 0.35],
              scale: [0.92, 1.04, 0.92],
              borderColor: [
                'rgba(168,162,158,0.5)',
                'rgba(23,23,23,0.7)',
                'rgba(168,162,158,0.5)',
              ],
            }}
            transition={{
              repeat: Infinity,
              duration: 2.1,
              delay: i * 0.4,
              ease: 'easeInOut',
            }}
          >
            <span className="h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500" />
            {t}
          </motion.span>
        ))}
      </span>
      <span className="font-sans text-[10.5px] text-neutral-500 dark:text-neutral-400">
        结构化推理中
      </span>
    </div>
  );
}
