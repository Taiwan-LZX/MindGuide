'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  X,
  Check,
  Trash2,
  Trophy,
  Lock,
  Flame,
  MessageSquare,
  Compass,
  Crown,
  Brain,
  Layers,
  BarChart3,
  Clock,
  BookOpen,
  RotateCcw,
  RotateCw,
  StickyNote,
  GripVertical,
  Layers3,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
// PDFImportView removed during cleanup — feature replaced with notes editor
import TiptapEditor from '@/components/learning/tiptap-editor';
import { CardReviewMode } from '@/components/learning/card-review-mode';
import { ScrollProgress } from '@/components/learning/scroll-progress';
import { formatInterval } from '@/lib/sm2';

// ─── Animation Variants ─────────────────────────────────────────────────────
//
// Tactile ("手感") tuning for interface switching:
//  - Entry uses a soft spring (stiffness 240, damping 28, mass 0.9) so the
//    view "settles" into place rather than snapping — gives the user a
//    perceptible sense of motion ("过渡感") instead of a 300ms linear slide.
//  - A tiny scale 0.985 → 1 adds depth (the view feels like it comes
//    "toward" the user, not just slides sideways).
//  - Exit is a 280ms ease-in with a small leftward x + scale-down so the
//    previous view "leaves the desk" — long enough to register but short
//    enough not to block the new view.
//  - Combined with `mode="wait"` on AnimatePresence, the total perceptible
//    transition is ~0.6s, which reads as deliberate.

const pageVariants = {
  hidden: { opacity: 0, x: 24, scale: 0.985 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 240,
      damping: 28,
      mass: 0.9,
    },
  },
  exit: {
    opacity: 0,
    x: -16,
    scale: 0.99,
    transition: {
      duration: 0.28,
      ease: [0.4, 0, 1, 1],
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.08 + 0.045 * i,
      type: 'spring',
      stiffness: 320,
      damping: 28,
      mass: 0.8,
    },
  }),
};

// ─── Feature View Router ─────────────────────────────────────────────────────

export function FeatureView() {
  const { activeFeatureView } = useLearningStore();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence mode="wait">
      {activeFeatureView && (
        <motion.div
          key={activeFeatureView}
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative flex h-full flex-1 flex-col"
        >
          <ScrollProgress targetRef={scrollRef} />
          {/* PDF import removed during cleanup */}
          {activeFeatureView === 'tasks' && <TaskPlannerView scrollRef={scrollRef} />}
          {activeFeatureView === 'cards' && <LearningCardsView scrollRef={scrollRef} />}
          {activeFeatureView === 'achievements' && <AchievementsView scrollRef={scrollRef} />}
          {activeFeatureView === 'stats' && <StatsView scrollRef={scrollRef} />}
          {activeFeatureView === 'graph' && <KnowledgeGraphView scrollRef={scrollRef} />}
          {activeFeatureView === 'notes' && <NotesView />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Shared Header ──────────────────────────────────────────────────────────
//
// The header follows an academic-paper convention: a small section ordinal
// (§N) in tabular-nums + a serif title. The hairline divider underneath
// matches the rule used above footnotes in printed journals.

const FEATURE_SECTION_NUMBER: Record<string, string> = {
  tasks: '01',
  cards: '02',
  achievements: '03',
  stats: '04',
  graph: '05',
  notes: '06',
};

function FeatureHeader({ title, icon: Icon, color }: { title: string; icon: React.ElementType; color: string }) {
  const { activeFeatureView, setActiveFeatureView } = useLearningStore();
  const sectionNo = activeFeatureView ? FEATURE_SECTION_NUMBER[activeFeatureView] ?? '' : '';

  return (
    <div className="flex h-14 shrink-0 items-center border-b border-neutral-200 dark:border-neutral-800">
      {/* Inner row constrained to the same max-width as the content below, so
          the back button + title left edge aligns perfectly with the content's
          left edge (no stair-step when the viewport is wider than 600px). */}
      <div className="mx-auto flex w-full max-w-[600px] items-center gap-3 px-6">
        <motion.button
          whileHover={{
            scale: 1.06,
            x: -2,
            transition: { type: 'spring', stiffness: 400, damping: 22 },
          }}
          whileTap={{
            scale: 0.94,
            transition: { type: 'spring', stiffness: 600, damping: 25 },
          }}
          onClick={() => setActiveFeatureView(null)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          aria-label="返回"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {sectionNo && (
          <span className="font-serif text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
            §{sectionNo}
          </span>
        )}
        <h1 className="font-serif text-[16px] font-medium text-neutral-900 dark:text-neutral-100">{title}</h1>
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          delay: 0.18,
          type: 'spring',
          stiffness: 260,
          damping: 26,
          mass: 0.9,
        },
      }}
      className="flex flex-1 flex-col items-center justify-center px-6"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
        <Icon className="h-6 w-6" />
      </div>
      <p className="mb-1 text-[14px] font-medium text-neutral-500 dark:text-neutral-400">{title}</p>
      <p className="text-[13px] text-neutral-400">{description}</p>
    </motion.div>
  );
}

// ─── 1. PDF Import View is now in pdf-import-view.tsx ──────────────────

// ─── 2. Task Planner View ───────────────────────────────────────────────────
//
// Each task has a priority 1–5 (visible as a vertical 5-segment bar; click to
// cycle). Tasks can be reordered by dragging the grip handle on the left.
// Drag-and-drop is implemented with native HTML5 DnD (no extra deps) to keep
// the bundle thin and the academic aesthetic uncluttered.

const PRIORITY_LABELS: Record<number, string> = {
  1: '很低',
  2: '较低',
  3: '中等',
  4: '较高',
  5: '很高',
};

function PriorityBar({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  // 5 stacked segments; the bottom `value` are filled (dark), the rest neutral.
  // Click on segment N sets priority to N.
  return (
    <div
      className="flex flex-col-reverse gap-[2px]"
      role="slider"
      aria-label={`优先级 ${value} / 5`}
      aria-valuenow={value}
      aria-valuemin={1}
      aria-valuemax={5}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onChange(n); }}
            className={`h-[3px] w-3.5 rounded-[1px] transition-colors ${
              filled
                ? 'bg-neutral-800 dark:bg-neutral-200'
                : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600'
            } ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
            aria-label={`设为优先级 ${n}`}
          />
        );
      })}
    </div>
  );
}

function TaskPlannerView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { tasks, addTask, toggleTask, deleteTask, setTaskPriority, reorderTasks, isLoadingTasks } = useLearningStore();
  const [newTask, setNewTask] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [newPriority, setNewPriority] = React.useState(3);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);

  const submit = React.useCallback(async () => {
    const t = newTask.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    setNewTask('');
    await addTask(t, newPriority);
    setSubmitting(false);
  }, [newTask, submitting, addTask, newPriority]);

  const doneCount = tasks.filter(t => t.done).length;
  const pct = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0;

  // Sort by order (fallback to createdAt)
  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [tasks]);

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const ids = sortedTasks.map(t => t.id);
    const fromIdx = ids.indexOf(draggingId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggingId);
    void reorderTasks(ids);
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <>
      <FeatureHeader title="任务规划" icon={Check} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">
          {/* Progress */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center justify-between text-[13px]"
          >
            <span className="text-neutral-500 dark:text-neutral-400">进度 {doneCount}/{tasks.length}</span>
            <motion.div
              className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                className="h-full rounded-full bg-neutral-900 dark:bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              />
            </motion.div>
          </motion.div>

          {/* Add task — with priority picker */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }}
            className="mb-4 rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="添加学习任务..."
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { void submit(); } }}
                className="h-9 flex-1 bg-transparent px-2 text-[13px] transition-colors duration-150 focus:outline-none dark:text-neutral-200"
              />
              <motion.button
                whileHover={{
                  scale: 1.05,
                  transition: { type: 'spring', stiffness: 400, damping: 22 },
                }}
                whileTap={{
                  scale: 0.94,
                  transition: { type: 'spring', stiffness: 600, damping: 25 },
                }}
                onClick={() => { void submit(); }}
                disabled={submitting}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white transition-opacity disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                <Plus className="h-4 w-4" />
              </motion.button>
            </div>
            {/* Priority selector for new task */}
            <div className="mt-1.5 flex items-center gap-3 border-t border-neutral-100 px-2 pt-2 dark:border-neutral-800">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">优先级</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNewPriority(n)}
                    className={`h-5 w-5 rounded-md border text-[10px] tabular-nums transition-colors ${
                      newPriority === n
                        ? 'border-neutral-800 bg-neutral-800 text-white dark:border-neutral-200 dark:bg-neutral-200 dark:text-neutral-900'
                        : 'border-neutral-200 text-neutral-400 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-500'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{PRIORITY_LABELS[newPriority]}</span>
            </div>
          </motion.div>

          {/* Task list */}
          <AnimatePresence mode="popLayout" initial={false}>
            {isLoadingTasks && tasks.length === 0 && (
              <div className="space-y-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 dark:bg-neutral-900">
                    <div className="h-5 w-5 shrink-0 rounded-md bg-neutral-100 dark:bg-neutral-800" />
                    <div className="h-3 flex-1 rounded bg-neutral-100 dark:bg-neutral-800" style={{ width: `${60 - i * 12}%` }} />
                  </div>
                ))}
              </div>
            )}
            {!isLoadingTasks && tasks.length === 0 && <EmptyState icon={Check} title="暂无任务" description="添加学习任务来规划你的学习路径" />}
            {sortedTasks.map((task, i) => {
              const isDragging = draggingId === task.id;
              const isDragOver = dragOverId === task.id && draggingId !== task.id;
              return (
                <motion.div
                  key={task.id}
                  custom={i}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.15 } }}
                  layout
                  draggable
                  onDragStart={() => setDraggingId(task.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverId(task.id); }}
                  onDrop={() => handleDrop(task.id)}
                  className={`group mb-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-2.5 transition-all ${
                    isDragging ? 'opacity-50' : ''
                  } ${
                    isDragOver ? 'border-neutral-400 bg-neutral-50 dark:border-neutral-500 dark:bg-neutral-800' : 'border-transparent'
                  } ${
                    task.done ? 'bg-neutral-50 dark:bg-neutral-800/50' : 'bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  {/* Drag handle */}
                  <span
                    className="flex h-5 w-3 cursor-grab items-center justify-center text-neutral-300 opacity-0 transition-opacity hover:text-neutral-500 group-hover:opacity-100 active:cursor-grabbing dark:text-neutral-600 dark:hover:text-neutral-300"
                    aria-hidden="true"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  {/* Checkbox */}
                  <motion.button
                    whileTap={{
                      scale: 0.8,
                      transition: { type: 'spring', stiffness: 600, damping: 18 },
                    }}
                    onClick={() => { void toggleTask(task.id); }}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      task.done
                        ? 'border-neutral-700 bg-neutral-700 text-white dark:border-neutral-300 dark:bg-neutral-300 dark:text-neutral-900'
                        : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                  >
                    {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </motion.button>
                  {/* Priority bar — interactive 5-segment slider. We use a
                      non-button wrapper (span) so we don't generate invalid
                      <button><button></button></button> HTML, which React
                      hydration will reject. */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void setTaskPriority(task.id, task.priority >= 5 ? 1 : task.priority + 1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        void setTaskPriority(task.id, task.priority >= 5 ? 1 : task.priority + 1);
                      }
                    }}
                    className="shrink-0 cursor-pointer px-1 py-1 outline-none focus-visible:rounded focus-visible:ring-1 focus-visible:ring-neutral-400"
                    title={`优先级 ${task.priority} / 5 — 点击切换`}
                    aria-label={`切换优先级，当前 ${task.priority}`}
                  >
                    <PriorityBar value={task.priority} onChange={(v) => { void setTaskPriority(task.id, v); }} />
                  </span>
                  {/* Title */}
                  <span className={`flex-1 text-[13px] ${task.done ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-700 dark:text-neutral-200'}`}>
                    {task.title}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                  <motion.button
                    whileTap={{
                      scale: 0.8,
                      transition: { type: 'spring', stiffness: 600, damping: 18 },
                    }}
                    onClick={() => { void deleteTask(task.id); }}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200 group-hover:opacity-100 dark:hover:bg-neutral-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </motion.button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ─── 3. Learning Cards View ────────────────────────────────────────────────

function LearningCardsView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { cards, addCard, toggleCardMastered, deleteCard, isLoadingCards, isReviewing, startReview } = useLearningStore();
  const [front, setFront] = React.useState('');
  const [back, setBack] = React.useState('');
  const [flipped, setFlipped] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const masteredCount = cards.filter(c => c.mastered).length;
  const dueCount = React.useMemo(() => {
    const now = Date.now();
    return cards.filter(c => c.dueAt === null || new Date(c.dueAt).getTime() <= now).length;
  }, [cards]);

  const submit = React.useCallback(async () => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b || submitting) return;
    setSubmitting(true);
    setFront('');
    setBack('');
    await addCard(f, b);
    setSubmitting(false);
  }, [front, back, submitting, addCard]);

  // If review mode is active, render the dedicated review UI instead.
  if (isReviewing) {
    return <CardReviewMode />;
  }

  return (
    <>
      <FeatureHeader title="学习卡片" icon={RotateCcw} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Stats bar + review button */}
        <div className="shrink-0 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
          <div className="mx-auto flex max-w-[600px] items-center justify-between text-[12px] text-neutral-400">
            <span>{cards.length} 张卡片</span>
            <span>{masteredCount} 已掌握</span>
            <span>{dueCount} 待复习</span>
          </div>
          <div className="mx-auto mt-2.5 flex max-w-[600px]">
            <motion.button
              whileHover={{
                scale: cards.length === 0 ? 1 : 1.015,
                transition: { type: 'spring', stiffness: 400, damping: 22 },
              }}
              whileTap={{
                scale: cards.length === 0 ? 1 : 0.975,
                transition: { type: 'spring', stiffness: 600, damping: 25 },
              }}
              onClick={() => { void startReview(); }}
              disabled={cards.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
            >
              <RotateCw className="h-3.5 w-3.5" />
              开始复习
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                {dueCount > 0 ? `· ${dueCount} 张到期` : '· 全部卡片'}
              </span>
            </motion.button>
          </div>
        </div>

        {/* Card grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          <div className="mx-auto grid max-w-[600px] grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {isLoadingCards && cards.length === 0 && (
                <>
                  {[0, 1, 2, 3].map(i => (
                    <div key={`sk-${i}`} className="flex min-h-[120px] flex-col justify-between rounded-xl border border-neutral-100 p-3 dark:border-neutral-800">
                      <div className="h-3 w-3/4 rounded bg-neutral-100 dark:bg-neutral-800" />
                      <div className="h-3 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
                    </div>
                  ))}
                </>
              )}
              {!isLoadingCards && cards.length === 0 && (
                <EmptyState key="empty" icon={RotateCcw} title="暂无卡片" description="创建闪卡来强化记忆" />
              )}
              {cards.map((card, i) => {
                const isDue = card.dueAt === null || new Date(card.dueAt).getTime() <= Date.now();
                return (
                  <motion.div
                    key={card.id}
                    custom={i}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                    layout
                    onClick={() => setFlipped(flipped === card.id ? null : card.id)}
                    className={`group relative flex min-h-[120px] cursor-pointer flex-col justify-between rounded-xl border p-3 transition-all ${
                      card.mastered
                        ? 'border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600'
                    }`}
                  >
                    {/* Delete button — appears on hover */}
                    <button
                      onClick={e => { e.stopPropagation(); void deleteCard(card.id); }}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-neutral-300 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-500 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                      aria-label="删除卡片"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <div>
                      <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                        {flipped === card.id ? card.back : card.front}
                      </p>
                      {flipped === card.id && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mt-1.5 text-[11px] text-neutral-400"
                        >
                          {card.front}
                        </motion.p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                        <span>{card.category}</span>
                        {/* Due badge: shows next review info */}
                        {card.dueAt ? (
                          <span className={`rounded border px-1 py-0.5 text-[9px] tabular-nums ${
                            isDue
                              ? 'border-neutral-400 text-neutral-600 dark:border-neutral-500 dark:text-neutral-300'
                              : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500'
                          }`}>
                            {isDue ? '待复习' : `${formatInterval(card.interval)}后`}
                          </span>
                        ) : (
                          <span className="rounded border border-neutral-200 px-1 py-0.5 text-[9px] text-neutral-400 dark:border-neutral-700">
                            未复习
                          </span>
                        )}
                      </div>
                      <motion.button
                        whileTap={{
                          scale: 0.8,
                          transition: { type: 'spring', stiffness: 600, damping: 18 },
                        }}
                        onClick={e => { e.stopPropagation(); void toggleCardMastered(card.id); }}
                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                          card.mastered ? 'border-neutral-700 bg-neutral-700 text-white dark:border-neutral-300 dark:bg-neutral-300 dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {card.mastered && <Check className="h-3 w-3" strokeWidth={3} />}
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Add card form */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="flex min-h-[120px] flex-col gap-2 rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
            >
              <input
                type="text"
                placeholder="正面（问题）"
                value={front}
                onChange={e => setFront(e.target.value)}
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-[12px] transition-colors duration-150 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              />
              <input
                type="text"
                placeholder="背面（答案）"
                value={back}
                onChange={e => setBack(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { void submit(); } }}
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-[12px] transition-colors duration-150 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              />
              <motion.button
                whileHover={{
                  scale: 1.04,
                  transition: { type: 'spring', stiffness: 400, damping: 22 },
                }}
                whileTap={{
                  scale: 0.96,
                  transition: { type: 'spring', stiffness: 600, damping: 25 },
                }}
                onClick={() => { void submit(); }}
                disabled={submitting}
                className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-neutral-900 py-1.5 text-[12px] font-medium text-white transition-opacity disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                <Plus className="h-3 w-3" /> 添加卡片
              </motion.button>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── 4. Achievements View ──────────────────────────────────────────────────

const achievementIcons: Record<string, React.ElementType> = {
  message: MessageSquare,
  compass: Compass,
  flame: Flame,
  crown: Crown,
  brain: Brain,
  layers: Layers,
};

function AchievementsView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { achievements, stats, fetchStats, isLoadingStats } = useLearningStore();

  // Fetch fresh stats on mount (achievements are derived from real DB data)
  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalProgressPct = achievements.length > 0
    ? Math.round((unlockedCount / achievements.length) * 100)
    : 0;

  return (
    <>
      <FeatureHeader title="成就系统" icon={Trophy} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">
          {/* Summary with circular progress */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-4 dark:border-neutral-800/70 dark:bg-neutral-900/50"
          >
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" strokeWidth="4" className="stroke-neutral-200 dark:stroke-neutral-800" />
                  <motion.circle
                    cx="28" cy="28" r="24" fill="none" strokeWidth="4" strokeLinecap="round"
                    className="stroke-neutral-700 dark:stroke-neutral-300"
                    initial={{ strokeDasharray: '0 150.8' }}
                    animate={{ strokeDasharray: `${(totalProgressPct / 100) * 150.8} 150.8` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[12px] font-bold text-neutral-900 dark:text-neutral-100">{totalProgressPct}%</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">{unlockedCount}/{achievements.length} 成就</p>
                <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
                  {isLoadingStats ? '统计中...' : (unlockedCount === achievements.length ? '全部解锁' : '继续学习来解锁更多成就')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400">连续学习</span>
                <span className="text-[16px] font-bold text-neutral-900 dark:text-neutral-100">{stats?.currentStreak ?? 0}<span className="text-[11px] font-normal text-neutral-400 ml-0.5">天</span></span>
              </div>
            </div>
          </motion.div>

          {/* Achievement list */}
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {achievements.length === 0 && (
                <EmptyState icon={Trophy} title="加载中" description="正在获取成就数据..." />
              )}
              {achievements.map((ach, i) => {
                const Icon = achievementIcons[ach.icon] || Trophy;
                const pct = ach.maxProgress > 0 ? Math.min((ach.progress / ach.maxProgress) * 100, 100) : 0;
                return (
                  <motion.div
                    key={ach.id}
                    custom={i}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    layout
                    className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                      ach.unlocked
                        ? 'border-neutral-300 bg-neutral-50/80 dark:border-neutral-700 dark:bg-neutral-800/40'
                        : 'border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                  >
                    <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      ach.unlocked
                        ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                        : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                    }`}>
                      {ach.unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${ach.unlocked ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'}`}>
                        {ach.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">{ach.description}</p>
                    </div>
                    <div className="shrink-0">
                      {ach.unlocked ? (
                        <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">已解锁</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                            <motion.div
                              className="h-full rounded-full bg-neutral-700 dark:bg-neutral-300"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 tabular-nums w-10 text-right">{ach.progress}/{ach.maxProgress}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── 5. Stats View ───────────────────────────────────────────────────────────

// ─── Stats view helper components ──────────────────────────────────────────

// A gauge icon (lucide doesn't export "Gauge" in all versions; alias Activity)
const GaugeIcon = BarChart3;

/** Circular progress ring showing mastered / total cards. */
function ReviewRing({ mastered, total }: { mastered: number; total: number }) {
  const pct = total > 0 ? mastered / total : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 72 72">
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-neutral-100 dark:stroke-neutral-800"
        />
        <motion.circle
          cx="36" cy="36" r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className="stroke-neutral-800 dark:stroke-neutral-200"
          strokeDasharray={`${dash} ${circumference}`}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${dash} ${circumference}` }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
          {Math.round(pct * 100)}%
        </span>
        <span className="text-[8px] uppercase tracking-wide text-neutral-400">掌握</span>
      </div>
    </div>
  );
}

/** Horizontal progress bar for a single review metric. */
function ReviewBar({
  label, value, total, tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: 'mature' | 'due' | 'young';
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const toneClass = {
    mature: 'bg-neutral-800 dark:bg-neutral-200',
    due: 'bg-neutral-400 dark:bg-neutral-500',
    young: 'bg-neutral-300 dark:bg-neutral-600',
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</span>
        <span className="text-[11px] font-medium tabular-nums text-neutral-700 dark:text-neutral-300">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <motion.div
          className={`h-full rounded-full ${toneClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
    </div>
  );
}

/** Compact labelled stat for the footer row. */
function MiniStat({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-neutral-400" />
      <div>
        <p className="text-[13px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">{value}</p>
        <p className="text-[9px] uppercase tracking-wide text-neutral-400">{label}</p>
      </div>
    </div>
  );
}

function StatsView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { stats, weeklyActivity, fetchStats, isLoadingStats } = useLearningStore();

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const statsCards = [
    { label: '学习会话', value: stats?.sessions ?? 0, icon: BookOpen, color: 'text-neutral-700 dark:text-neutral-200' },
    { label: '对话轮数', value: stats?.messages ?? 0, icon: MessageSquare, color: 'text-neutral-700 dark:text-neutral-200' },
    { label: '知识点', value: stats?.knowledgeNodes ?? 0, icon: Layers, color: 'text-neutral-700 dark:text-neutral-200', sub: `${stats?.masteredKnowledge ?? 0} 已掌握` },
    { label: '学习时长', value: stats?.learningTimeLabel ?? '0m', icon: Clock, color: 'text-neutral-700 dark:text-neutral-200' },
  ];

  // Compute weekly activity max for bar scaling
  const maxWeekly = Math.max(1, ...(weeklyActivity?.map(d => d.count) || [1]));

  return (
    <>
      <FeatureHeader title="学习统计" icon={BarChart3} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">
          {/* Hero metric: current streak */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-5 dark:border-neutral-800/70 dark:bg-neutral-900/50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">当前连续学习</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                    className="text-[32px] font-bold leading-none text-neutral-900 dark:text-neutral-100"
                  >
                    {stats?.currentStreak ?? 0}
                  </motion.span>
                  <span className="text-[13px] text-neutral-500 dark:text-neutral-400">天</span>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-400">
                  {(stats?.currentStreak ?? 0) >= 3 ? '保持下去' : '继续学习来培养习惯'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Stats grid */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            {statsCards.map((s, i) => (
              <motion.div
                key={s.label}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                className="group relative overflow-hidden rounded-xl border border-neutral-100 bg-white p-4 transition-all hover:border-neutral-200 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-50 transition-colors group-hover:bg-neutral-100 dark:bg-neutral-800 dark:group-hover:bg-neutral-700">
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  {'sub' in s && s.sub && (
                    <span className="rounded-full border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                      {s.sub}
                    </span>
                  )}
                </div>
                <div className="mt-2.5">
                  <p className="text-[20px] font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{s.value}</p>
                  <p className="text-[11px] text-neutral-400">{s.label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ─── Review progress (SM-2 cards + tasks) ─────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
            className="mb-6 rounded-xl border border-neutral-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-neutral-400" />
                <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">复习进度</p>
              </div>
              {(stats?.dueCards ?? 0) > 0 && (
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
                  {stats?.dueCards} 张待复习
                </span>
              )}
            </div>

            {/* Mastery ring + breakdown */}
            <div className="flex items-center gap-5">
              {/* Circular progress — mastered / total */}
              <ReviewRing
                mastered={stats?.masteredCards ?? 0}
                total={stats?.totalCards ?? 0}
              />

              {/* Breakdown bars */}
              <div className="flex-1 space-y-2.5">
                <ReviewBar
                  label="已掌握"
                  value={stats?.masteredCards ?? 0}
                  total={stats?.totalCards ?? 0}
                  tone="mature"
                />
                <ReviewBar
                  label="待复习"
                  value={stats?.dueCards ?? 0}
                  total={stats?.totalCards ?? 0}
                  tone="due"
                />
                <ReviewBar
                  label="已复习"
                  value={stats?.reviewedCards ?? 0}
                  total={stats?.totalCards ?? 0}
                  tone="young"
                />
              </div>
            </div>

            {/* Footer mini-stats */}
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <MiniStat
                icon={Layers3}
                label="卡片总数"
                value={stats?.totalCards ?? 0}
              />
              <MiniStat
                icon={GaugeIcon}
                label="平均 Ease"
                value={(stats?.avgEase ?? 2.5).toFixed(2)}
              />
              <MiniStat
                icon={ListChecks}
                label="任务完成"
                value={`${stats?.doneTasks ?? 0}/${stats?.totalTasks ?? 0}`}
              />
            </div>
          </motion.div>

          {/* Weekly activity (real data from /api/stats) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.25 } }}
            className="rounded-xl border border-neutral-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">本周学习活动</p>
              <span className="text-[11px] text-neutral-400">
                {isLoadingStats ? '加载中...' : `共 ${weeklyActivity?.reduce((s, d) => s + d.count, 0) ?? 0} 条消息`}
              </span>
            </div>
            <div className="flex items-end justify-between gap-2 px-2">
              {(weeklyActivity && weeklyActivity.length > 0 ? weeklyActivity : [
                { label: '一', count: 0 }, { label: '二', count: 0 }, { label: '三', count: 0 },
                { label: '四', count: 0 }, { label: '五', count: 0 }, { label: '六', count: 0 }, { label: '日', count: 0 },
              ]).map((day, i) => {
                const heightPct = Math.max(4, (day.count / maxWeekly) * 100);
                const isToday = i === 6; // last bucket is "today"
                return (
                  <motion.div
                    key={i}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.3 + i * 0.05, duration: 0.4 }}
                    className="flex flex-1 flex-col items-center gap-1.5"
                    style={{ transformOrigin: 'bottom' }}
                  >
                    <div className="relative flex w-full flex-col justify-end" style={{ height: '80px' }}>
                      <motion.div
                        className={`w-full rounded-md transition-colors ${
                          day.count > 0
                            ? (isToday ? 'bg-neutral-800 dark:bg-neutral-200' : 'bg-neutral-300 dark:bg-neutral-600')
                            : 'bg-neutral-100 dark:bg-neutral-800'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      >
                        {day.count > 0 && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-medium text-neutral-500 dark:text-neutral-400 tabular-nums">
                            {day.count}
                          </span>
                        )}
                      </motion.div>
                    </div>
                    <span className={`text-[10px] ${isToday ? 'font-bold text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`}>{day.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}

// ─── 6. Knowledge Graph View ───────────────────────────────────────────────

function KnowledgeGraphView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { knowledgeNodes } = useLearningStore();

  return (
    <>
      <FeatureHeader title="知识图谱" icon={Layers} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">
          {knowledgeNodes.length === 0 ? (
            <EmptyState icon={Layers} title="知识图谱为空" description="开始学习来构建你的知识网络" />
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {knowledgeNodes.map((node, i) => (
                  <motion.div
                    key={node.id}
                    custom={i}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    className={`flex items-center gap-3 rounded-xl border p-3.5 ${
                      node.mastered
                        ? 'border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50'
                        : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      node.mastered
                        ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                        : 'border border-neutral-200 text-neutral-400 dark:border-neutral-700'
                    }`}>
                      {node.mastered ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <span className="text-[12px] leading-none">·</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-medium text-neutral-700 dark:text-neutral-200">{node.title}</p>
                      {node.category && <p className="text-[11px] text-neutral-400">{node.category}</p>}
                    </div>
                    <div className="text-[11px] text-neutral-400 tabular-nums">
                      重要度 {node.importance}/5
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── 7. Notes View ─────────────────────────────────────────────────────────

function NotesView() {
  return (
    <>
      <FeatureHeader title="学习笔记" icon={StickyNote} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <TiptapEditor />
    </>
  );
}
