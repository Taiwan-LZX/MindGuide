'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Page-level entry/exit variants ─────────────────────────────────────────
// OWNED BY page.tsx — this is the animation boundary for the welcome ↔ feature
// transition. (Previously lived inside FeatureView, but page.tsx's
// `{activeFeatureView ? <FeatureView /> : <MainContent />}` synchronously
// unmounted FeatureView before AnimatePresence could fire exit — see
// /home/z/my-project/worklog.md "anim-refine-003" for the full diagnosis.)
//
// Direction semantics:
//   dir = +1  → forward (welcome → feature, or feature → different feature)
//   dir = -1  → backward (feature → welcome)
//
// Easing rationale (post user-feedback "关闭的过渡动画无帧数直接闪现"):
//   · Exit previously used ease-in [0.4, 0, 1, 1] which keeps opacity near 1
//     for the first 40% of duration. Combined with ~50ms React commit delay,
//     users saw 195ms of "nothing happening" then a sudden vanish — the
//     "instant close" perception.
//   · Switched exit to ease-out [0.16, 1, 0.3, 1] (snoozeOut): visible motion
//     starts in the very first frame, then gently trails off. The user
//     immediately sees the panel leaving, eliminating the dead-time window.
//   · Entry keeps spring physics — overshoot + settle reads as "arriving".
//   · Per-property transition split: opacity fades slightly faster than
//     transform, so the user perceives "fading out while drifting away"
//     instead of "transform completing then opacity cutting".

export const pageVariants = {
  hidden: (dir: number) => ({
    opacity: 0,
    x: 28 * dir,
    scale: 0.97,
  }),
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 220,
      damping: 26,
      mass: 0.9,
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: -22 * dir,
    scale: 0.98,
    transition: {
      // Split per-property so opacity leads (perceptible fade from frame 1)
      // and transform follows with a slight ease-out trail.
      opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
      x: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
      scale: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
    },
  }),
};

import {
  ArrowLeft,
  Plus,
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
  FileText,
  Upload,
  Loader2,
  File,
  ChevronDown,
  ChevronRight,
  Search,
  FileSearch,
  Quote,
  Zap,
  Gauge,
  ScanLine,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
// PDFImportView removed during cleanup — feature replaced with notes editor
import TiptapEditor from '@/components/learning/tiptap-editor';
import { CardReviewMode } from '@/components/learning/card-review-mode';
import { ScrollProgress } from '@/components/learning/scroll-progress';
import { formatInterval } from '@/lib/sm2';

// ─── Animation Variants ─────────────────────────────────────────────────────
//
// Personality: "journey" — interface switching carries directional intent.
// The user either *enters* a feature (forward, from welcome) or *returns* from
// one (backward, to welcome). The motion respects that direction so the
// spatial metaphor holds: forward = pushed from the right (depth entry),
// backward = pushed from the left (depth return).
//
// Differentiation vs. other surfaces:
//  · Quick menu (command): 380/30/0.6 — snappy utility, no depth cue.
//  · More features (discovery): 280/26/0.9 — soft, overshoot ~2%, ~520ms.
//  · Settings (ceremony): 200/24/1.0 — heavy, ~700ms, deliberate.
//  · Feature page (journey): 220/26/0.9 — purposeful, ~620ms, with a clear
//    directional x push + a tiny scale (0.97 → 1) that reads as depth.
//
// `custom` is the direction: +1 = forward (entering a feature), -1 = backward
// (returning to welcome). The exit mirrors the entry direction so the old
// view leaves the opposite way.
//
// NOTE: pageVariants now lives at the top of this file (exported) and is
// consumed by page.tsx's AnimatePresence. The FeatureView component below
// no longer owns an AnimatePresence — page.tsx does. This fixes the
// "feature view back-exit never animates" bug documented in worklog.md
// anim-refine-003: previously, page.tsx's
//   `{activeFeatureView ? <FeatureView /> : <MainContent />}`
// synchronously unmounted FeatureView (and its internal AnimatePresence)
// before framer-motion could fire the exit variant.

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.08 + 0.045 * i,
      type: 'spring' as const,
      stiffness: 320,
      damping: 28,
      mass: 0.8,
    },
  }),
};

// ─── Feature View (pure content) ───────────────────────────────────────────
// Page-level entry/exit animations are owned by page.tsx's AnimatePresence
// (see `pageVariants` exported above). This component just renders the
// currently-active feature's content. The activeFeatureView key on the
// wrapping motion.div in page.tsx ensures feature-to-feature switches also
// animate (the wrapper unmounts + remounts with a new key).

export function FeatureView() {
  const { activeFeatureView } = useLearningStore();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex h-full flex-1 flex-col">
      <ScrollProgress targetRef={scrollRef} />
      {/* PDF import removed during cleanup */}
      {activeFeatureView === 'tasks' && <TaskPlannerView scrollRef={scrollRef} />}
      {activeFeatureView === 'cards' && <LearningCardsView scrollRef={scrollRef} />}
      {activeFeatureView === 'progress' && <ProgressView scrollRef={scrollRef} />}
      {activeFeatureView === 'graph' && <KnowledgeGraphView scrollRef={scrollRef} />}
      {activeFeatureView === 'notes' && <NotesView />}
      {activeFeatureView === 'materials' && <MaterialsView scrollRef={scrollRef} />}
    </div>
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
  progress: '03',
  graph: '04',
  notes: '05',
  materials: '06',
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
              {/* Progress fill uses transform: scaleX (composited) instead of
                  width: % (which triggers layout). transformOrigin: left so
                  the bar grows from the left edge. scaleX takes a 0-1 value. */}
              <motion.div
                className="h-full rounded-full bg-neutral-900 dark:bg-white"
                style={{ transformOrigin: 'left' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
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

// ─── 4. Progress View (merged: achievements + stats) ────────────────────────
//
// Formerly two separate views (Achievements + Stats). Merged because:
//   · Both consumed the same /api/stats feed
//   · Metrics overlapped (streak, card mastery appeared in both)
//   · Learners had to switch views to see related info
// The merged view stacks: [achievements summary + list] then [stats grid +
// review progress + weekly activity] — motivational layer on top, analytical
// layer below. One cognitive context, one scroll.

const achievementIcons: Record<string, React.ElementType> = {
  message: MessageSquare,
  compass: Compass,
  flame: Flame,
  crown: Crown,
  brain: Brain,
  layers: Layers,
};

function ProgressView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { achievements, stats, fetchStats, isLoadingStats, weeklyActivity } = useLearningStore();

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalProgressPct = achievements.length > 0
    ? Math.round((unlockedCount / achievements.length) * 100)
    : 0;

  const statsCards = [
    { label: '学习会话', value: stats?.sessions ?? 0, icon: BookOpen, color: 'text-neutral-700 dark:text-neutral-200' },
    { label: '对话轮数', value: stats?.messages ?? 0, icon: MessageSquare, color: 'text-neutral-700 dark:text-neutral-200' },
    { label: '知识点', value: stats?.knowledgeNodes ?? 0, icon: Layers, color: 'text-neutral-700 dark:text-neutral-200', sub: `${stats?.masteredKnowledge ?? 0} 已掌握` },
    { label: '学习时长', value: stats?.learningTimeLabel ?? '0m', icon: Clock, color: 'text-neutral-700 dark:text-neutral-200' },
  ];

  const maxWeekly = Math.max(1, ...(weeklyActivity?.map(d => d.count) || [1]));

  return (
    <>
      <FeatureHeader title="学习进度" icon={Trophy} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">

          {/* ─── Achievements summary + list ─────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-4 dark:border-neutral-800/70 dark:bg-neutral-900/50"
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
          <div className="mb-6 space-y-2">
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
                              style={{ transformOrigin: 'left' }}
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
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

          {/* ─── Section divider: stats below ─────────────────────────────── */}
          <div className="mb-4 flex items-center gap-3">
            <span className="font-serif text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">§ 统计</span>
            <div className="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
          </div>

          {/* Streak hero */}
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

          {/* Review progress (SM-2 cards + tasks) */}
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

            <div className="flex items-center gap-5">
              <ReviewRing
                mastered={stats?.masteredCards ?? 0}
                total={stats?.totalCards ?? 0}
              />
              <div className="flex-1 space-y-2.5">
                <ReviewBar label="已掌握" value={stats?.masteredCards ?? 0} total={stats?.totalCards ?? 0} tone="mature" />
                <ReviewBar label="待复习" value={stats?.dueCards ?? 0} total={stats?.totalCards ?? 0} tone="due" />
                <ReviewBar label="已复习" value={stats?.reviewedCards ?? 0} total={stats?.totalCards ?? 0} tone="young" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <MiniStat icon={Layers3} label="卡片总数" value={stats?.totalCards ?? 0} />
              <MiniStat icon={GaugeIcon} label="平均 Ease" value={(stats?.avgEase ?? 2.5).toFixed(2)} />
              <MiniStat icon={ListChecks} label="任务完成" value={`${stats?.doneTasks ?? 0}/${stats?.totalTasks ?? 0}`} />
            </div>
          </motion.div>

          {/* Weekly activity */}
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
                const isToday = i === 6;
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

// ─── Progress view helper components ─────────────────────────────────────────

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
          style={{ transformOrigin: 'left' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
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

// ─── 8. Materials View (file import / knowledge base) ──────────────────────
//
// Personality note: this view is *not* a list of items to consume — it's a
// workspace where the learner feeds the AI. The drag-and-drop zone is the
// primary affordance, so it gets the most visual weight on empty state. Once
// materials exist, they become a reference library: a quiet list with
// inline-rename, delete, and a clear "how this is used" footer.
//
// The extracted-text indicator (charCount) matters because the learner needs
// to know whether a file was actually parsed or just stored as metadata —
// PDFs and images show 0 chars (we don't parse them in v1), text files show
// their real count.

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MaterialsView({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const {
    materials,
    isLoadingMaterials,
    isUploadingMaterials,
    currentSessionId,
    fetchMaterials,
    uploadMaterials,
    deleteMaterial,
    reparseMaterial,
    reparsingMaterialId,
  } = useLearningStore();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const reparseFileRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  // v2: precision selector for PDF uploads.
  //   fast   — unpdf text only (instant, free)
  //   medium — + MuPDF structured text fallback for sparse PDFs
  //   high   — + VLM page rendering for scanned/complex pages + semantic enrichment
  const [precision, setPrecision] = React.useState<'fast' | 'medium' | 'high'>('fast');
  // Track which material is queued for reparse (so the hidden file input knows).
  const [reparseTargetId, setReparseTargetId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (currentSessionId) fetchMaterials(currentSessionId);
  }, [currentSessionId, fetchMaterials]);

  const handleFiles = React.useCallback((files: FileList | File[]) => {
    if (!currentSessionId) return;
    const arr = Array.from(files);
    if (arr.length > 0) {
      void uploadMaterials(currentSessionId, arr, {
        precision,
        enrich: precision === 'high',
      });
    }
  }, [currentSessionId, uploadMaterials, precision]);

  // Reparse flow: user clicks "升级到高精度" → we open the hidden file input
  // → user re-selects the original PDF → we call reparseMaterial.
  const handleReparseFileSelect = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && reparseTargetId) {
      void reparseMaterial(reparseTargetId, file, { precision: 'high', enrich: true });
    }
    setReparseTargetId(null);
    e.target.value = '';
  }, [reparseTargetId, reparseMaterial]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      void useLearningStore.getState().updateMaterialTitle(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  const totalChars = materials.reduce((s, m) => s + (m.charCount || 0), 0);
  const totalChunks = materials.reduce((s, m) => s + (m.chunkCount || 0), 0);

  // Parser badge colour mapping — monochrome academic, but distinguishable.
  // v2 adds 'mupdf-text' (medium precision) and 'vlm-merged' (high precision).
  const parserLabel = (p?: string | null): { label: string; tone: string } => {
    switch (p) {
      case 'unpdf': return { label: 'PDF', tone: 'text-neutral-700 dark:text-neutral-300' };
      case 'mammoth': return { label: 'DOCX', tone: 'text-neutral-700 dark:text-neutral-300' };
      case 'xlsx': return { label: 'XLSX', tone: 'text-neutral-700 dark:text-neutral-300' };
      case 'pptx': return { label: 'PPTX', tone: 'text-neutral-700 dark:text-neutral-300' };
      case 'html': return { label: 'HTML', tone: 'text-neutral-700 dark:text-neutral-300' };
      case 'text': return { label: 'TEXT', tone: 'text-neutral-700 dark:text-neutral-300' };
      case 'mupdf-text': return { label: 'PDF·STRUCT', tone: 'text-emerald-700 dark:text-emerald-400' };
      case 'vlm-merged': return { label: 'PDF·VLM', tone: 'text-emerald-700 dark:text-emerald-400' };
      case 'failed': return { label: 'FAILED', tone: 'text-amber-600 dark:text-amber-500' };
      default: return { label: '—', tone: 'text-neutral-400' };
    }
  };

  return (
    <>
      <FeatureHeader title="文件导入" icon={FileText} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[680px] px-6 py-5">

          {/* ─── Drop zone / upload affordance ────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors ${
                isDragOver
                  ? 'border-neutral-400 bg-neutral-50 dark:border-neutral-500 dark:bg-neutral-800/50'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/30'
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {isUploadingMaterials ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-200">
                  {isUploadingMaterials ? '正在解析与索引…' : '拖拽文件到此处，或点击选择'}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  支持 PDF / DOCX / XLSX / PPTX / HTML / Markdown / 代码 / 纯文本，单文件 ≤ 25 MB
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {/* Hidden file input for reparse (single-file, PDF only) */}
            <input
              ref={reparseFileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleReparseFileSelect}
            />
          </motion.div>

          {/* ─── v2: Precision selector (PDF only) ─────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.04 } }}
            className="mb-5 rounded-xl border border-neutral-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="mb-2 flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
              <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-200">
                PDF 解析精度
              </p>
              <span className="text-[10px] text-neutral-400">
                · 仅影响 PDF 文件，其他格式始终使用最优解析器
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { key: 'fast', label: '快速', desc: '文本层提取 · 秒级', icon: Zap },
                { key: 'medium', label: '结构化', desc: 'MuPDF 布局感知 · 适合多栏', icon: ScanLine },
                { key: 'high', label: '高精度', desc: 'VLM 视觉理解 · 扫描件/表格/公式', icon: Sparkles },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPrecision(opt.key)}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-all ${
                    precision === opt.key
                      ? 'border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-800'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <opt.icon className={`h-3 w-3 ${precision === opt.key ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`} />
                    <span className={`text-[11px] font-medium ${precision === opt.key ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-300'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <span className="text-[9.5px] leading-tight text-neutral-400">{opt.desc}</span>
                </button>
              ))}
            </div>
            {precision === 'high' && (
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-500">
                <Sparkles className="mt-px h-3 w-3 shrink-0" />
                <span>高精度模式会调用 VLM 逐页解析（扫描件全页 / 复杂页选择性）并生成语义关键词索引，单文件耗时约 30 秒至数分钟。</span>
              </p>
            )}
          </motion.div>

          {/* ─── How this is used (info card) ────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.08 } }}
            className="mb-5 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                <FileSearch className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                导入的文件会经过<span className="font-medium text-neutral-700 dark:text-neutral-300"> 解析 → 结构化切片 → 向量化 </span>三步管线，
                形成 RAG 知识库。AI 对话与课程生成时会基于学习者当前问题<span className="font-medium text-neutral-700 dark:text-neutral-300"> 检索最相关的片段 </span>
                作为上下文，而非整篇塞入。
              </div>
            </div>
          </motion.div>

          {/* ─── Materials list ───────────────────────────────────────────── */}
          {isLoadingMaterials && materials.length === 0 ? (
            <EmptyState icon={FileText} title="加载中" description="正在获取已导入的文件…" />
          ) : materials.length === 0 ? (
            <EmptyState
              icon={File}
              title="还没有导入文件"
              description="拖拽或点击上方区域上传学习资料，AI 将基于这些内容进行 RAG 检索"
            />
          ) : (
            <>
              {/* Summary bar — now shows chunk count too */}
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400">
                  {materials.length} 个文件 · {formatBytes(materials.reduce((s, m) => s + (m.size || 0), 0))}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-neutral-400 tabular-nums">
                  <span>{totalChars.toLocaleString()} 字符</span>
                  <span className="text-neutral-300 dark:text-neutral-700">·</span>
                  <span>{totalChunks.toLocaleString()} 检索片段</span>
                </div>
              </div>

              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {materials.map((m, i) => (
                    <motion.div
                      key={m.id}
                      custom={i}
                      variants={itemVariants}
                      initial="hidden"
                      animate="visible"
                      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                      layout
                      className="group overflow-hidden rounded-xl border border-neutral-100 bg-white transition-colors hover:border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
                    >
                      {/* ── Row (click to expand) ────────────────────────── */}
                      <div className="flex items-center gap-3 p-3.5">
                        <button
                          onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                          aria-label={expandedId === m.id ? '折叠' : '展开'}
                        >
                          {expandedId === m.id ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                          <File className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingId === m.id ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                if (e.key === 'Escape') { setEditingId(null); setEditValue(''); }
                              }}
                              className="w-full rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(m.id, m.title || m.filename)}
                              className="block w-full truncate text-left text-[13px] font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-200 dark:hover:text-neutral-50"
                              title="点击重命名"
                            >
                              {m.title || m.filename}
                            </button>
                          )}
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
                            {/* Parser badge */}
                            {m.parser && (
                              <span className={`rounded border border-neutral-200 px-1 font-medium tracking-wide dark:border-neutral-700 ${parserLabel(m.parser).tone}`}>
                                {parserLabel(m.parser).label}
                              </span>
                            )}
                            <span className="truncate max-w-[120px]">{m.filename}</span>
                            <span className="text-neutral-300 dark:text-neutral-700">·</span>
                            <span className="tabular-nums">{formatBytes(m.size)}</span>
                            {m.pageCount ? (
                              <>
                                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                                <span className="tabular-nums">{m.pageCount} 页</span>
                              </>
                            ) : null}
                            {m.language ? (
                              <>
                                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                                <span className="uppercase">{m.language}</span>
                              </>
                            ) : null}
                            {m.chunkCount !== undefined && m.chunkCount > 0 ? (
                              <>
                                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                                <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{m.chunkCount} 片段</span>
                              </>
                            ) : null}
                            {m.charCount > 0 ? (
                              <>
                                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                                <span className="tabular-nums">{m.charCount.toLocaleString()} 字</span>
                              </>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-500">未提取文本</span>
                            )}
                          </div>
                        </div>
                        {/* v2: Reparse-to-high-precision button (PDFs only, not already VLM) */}
                        {m.parser === 'unpdf' || m.parser === 'mupdf-text' || m.parser === 'failed' ? (
                          <button
                            onClick={() => {
                              setReparseTargetId(m.id);
                              reparseFileRef.current?.click();
                            }}
                            disabled={reparsingMaterialId === m.id}
                            className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-neutral-400 opacity-0 transition-all hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 disabled:opacity-60 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                            aria-label="升级到高精度解析"
                            title="重新用 VLM 高精度解析（需重新选择原文件）"
                          >
                            {reparsingMaterialId === m.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            <span className="hidden sm:inline">
                              {reparsingMaterialId === m.id ? '解析中' : '升级'}
                            </span>
                          </button>
                        ) : null}
                        <button
                          onClick={() => void deleteMaterial(m.id)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-300 opacity-0 transition-all hover:bg-neutral-100 hover:text-neutral-600 group-hover:opacity-100 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                          aria-label="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* ── Expanded detail panel ─────────────────────────── */}
                      <AnimatePresence initial={false}>
                        {expandedId === m.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden border-t border-neutral-100 dark:border-neutral-800"
                          >
                            <MaterialDetailPanel materialId={m.id} filename={m.filename} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Material detail panel (shown when a material row is expanded) ──────────
//
// Shows three things:
//   1. Outline — the detected section hierarchy (from the parser)
//   2. Chunks — a paginated chunk viewer (so the learner can see what the
//      chunker produced — this is what the RAG retriever searches over)
//   3. Retrieval test — a search box that calls /api/sessions/[id]/retrieve
//      and shows the top-K passages for the query, so the learner can verify
//      the RAG system finds the right content.

function MaterialDetailPanel({ materialId, filename }: { materialId: string; filename: string }) {
  const [tab, setTab] = React.useState<'outline' | 'chunks' | 'retrieval'>('outline');
  const { currentSessionId } = useLearningStore();

  return (
    <div className="px-3.5 py-3">
      {/* Tab switcher */}
      <div className="mb-3 flex items-center gap-1 rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
        {(['outline', 'chunks', 'retrieval'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              tab === t
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            {t === 'outline' ? '大纲' : t === 'chunks' ? '检索片段' : '检索测试'}
          </button>
        ))}
      </div>

      {tab === 'outline' && <OutlinePanel materialId={materialId} />}
      {tab === 'chunks' && <ChunksPanel materialId={materialId} />}
      {tab === 'retrieval' && <RetrievalTestPanel sessionId={currentSessionId || ''} filename={filename} />}
    </div>
  );
}

function OutlinePanel({ materialId }: { materialId: string }) {
  const [outline, setOutline] = React.useState<any[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/materials/${materialId}/outline`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setOutline(d.outline || []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('加载大纲失败');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [materialId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-[11px] text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" /> 加载大纲…
      </div>
    );
  }
  if (error) return <div className="py-4 text-[11px] text-amber-600">{error}</div>;
  if (!outline || outline.length === 0) {
    return (
      <div className="py-4 text-[11px] text-neutral-400">
        未检测到结构化大纲。该文件可能没有标题层级（如纯文本 / 表格）。
      </div>
    );
  }

  const renderNodes = (nodes: any[], depth = 0): React.ReactNode => (
    <ul className={depth === 0 ? '' : 'ml-3 border-l border-neutral-100 pl-2 dark:border-neutral-800'}>
      {nodes.map((n, i) => (
        <li key={i} className="py-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-neutral-300 dark:text-neutral-700">H{n.level}</span>
            <span className="text-[11.5px] text-neutral-600 dark:text-neutral-300">{n.title}</span>
          </div>
          {n.children && n.children.length > 0 && renderNodes(n.children, depth + 1)}
        </li>
      ))}
    </ul>
  );

  return <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">{renderNodes(outline)}</div>;
}

function ChunksPanel({ materialId }: { materialId: string }) {
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/materials/${materialId}/chunks?page=${page}&pageSize=10${search ? `&search=${encodeURIComponent(search)}` : ''}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [materialId, page, search]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-4 text-[11px] text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" /> 加载片段…
      </div>
    );
  }
  if (!data || !data.chunks || data.chunks.length === 0) {
    return (
      <div className="py-4 text-[11px] text-neutral-400">
        {search ? '没有匹配的片段' : '该文件未生成检索片段（可能因为解析失败或文本为空）'}
      </div>
    );
  }

  return (
    <div>
      {/* Search box */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="过滤片段内容…"
          className="w-full rounded-md border border-neutral-200 bg-white py-1 pl-6 pr-2 text-[11px] text-neutral-700 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        />
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto custom-scrollbar">
        {data.chunks.map((c: any) => (
          <div key={c.id} className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-800/30">
            {c.section && (
              <div className="mb-1 flex items-center gap-1 text-[10px] text-neutral-400">
                <Quote className="h-2.5 w-2.5" />
                <span className="truncate">{c.section}</span>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="tabular-nums">#{c.chunkIndex + 1}</span>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="tabular-nums">~{c.tokens} tok</span>
              </div>
            )}
            {!c.section && (
              <div className="mb-1 text-[10px] text-neutral-400 tabular-nums">
                #{c.chunkIndex + 1} · ~{c.tokens} tok
              </div>
            )}
            <p className="line-clamp-4 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
              {c.content}
            </p>
          </div>
        ))}
      </div>
      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
          <span className="tabular-nums">第 {page} / {data.totalPages} 页 · 共 {data.total} 片段</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-neutral-200 px-1.5 py-0.5 disabled:opacity-30 dark:border-neutral-700"
            >上一页</button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="rounded border border-neutral-200 px-1.5 py-0.5 disabled:opacity-30 dark:border-neutral-700"
            >下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RetrievalTestPanel({ sessionId, filename }: { sessionId: string; filename: string }) {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<any[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  const runSearch = React.useCallback(async () => {
    if (!query.trim() || !sessionId) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK: 5 }),
      });
      if (!res.ok) { setResults([]); return; }
      const data = await res.json();
      setResults(data.passages || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, sessionId]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
            placeholder="输入一个问题，测试 RAG 检索效果…"
            className="w-full rounded-md border border-neutral-200 bg-white py-1 pl-6 pr-2 text-[11px] text-neutral-700 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          />
        </div>
        <button
          onClick={() => void runSearch()}
          disabled={!query.trim() || loading}
          className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >检索</button>
      </div>
      <p className="mb-2 text-[10px] text-neutral-400">
        这与 AI 对话和课程生成使用的检索逻辑完全一致 — 输入学习者可能问的问题，查看哪些片段会被召回。
      </p>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-[11px] text-neutral-400">
          <Loader2 className="h-3 w-3 animate-spin" /> 检索中…
        </div>
      )}

      {!loading && searched && results && results.length === 0 && (
        <div className="py-4 text-[11px] text-amber-600">
          未检索到相关片段。可能的原因：知识库为空、查询太短、或导入的文件内容与查询无关。
        </div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="max-h-80 space-y-2 overflow-y-auto custom-scrollbar">
          {results.map((r, i) => (
            <div key={i} className="rounded-md border border-neutral-100 bg-neutral-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-800/30">
              <div className="mb-1 flex items-center gap-1 text-[10px] text-neutral-400">
                <span className="rounded bg-neutral-200 px-1 font-medium text-neutral-600 tabular-nums dark:bg-neutral-700 dark:text-neutral-300">
                  {(r.score as number).toFixed(3)}
                </span>
                <span className="truncate">{r.materialTitle || filename}</span>
                {r.section && (
                  <>
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <span className="truncate">{r.section}</span>
                  </>
                )}
                {r.page ? (
                  <>
                    <span className="text-neutral-300 dark:text-neutral-700">·</span>
                    <span className="tabular-nums">p.{r.page}</span>
                  </>
                ) : null}
              </div>
              <p className="line-clamp-5 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                {r.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
