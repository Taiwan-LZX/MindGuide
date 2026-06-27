'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOTION } from '@/lib/motion-tokens';
import {
  X,
  Check,
  Play,
  Lock,
  ChevronDown,
  BookOpen,
  Sparkles,
  Brain,
  RotateCcw,
} from 'lucide-react';
import { useLearningStore, type CourseModule, type CourseLesson } from '@/store/learning-store';
import { InlineSpinner, LoadingOverlay } from '@/components/learning/loading-utils';

// ─── Shared Spring Config ────────────────────────────────────────────────────

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8 };

// ─── Animation Variants ─────────────────────────────────────────────────────
//
// Personality: "reveal" — redesigned to match the reference course design.
// Clean, flat, editorial. Module sections as plain rows (not nested cards),
// lessons as minimal rows with status icons + type chips + duration.
// Circular progress ring in the header replaces the old plain percentage.

const panelVariants = {
  hidden: { opacity: 0, scale: 0.97, x: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.85 },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    x: 24,
    transition: MOTION.enterSoft,
  },
};

const moduleContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const moduleVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28, mass: 0.8 },
  },
};

const lessonContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const lessonVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 380, damping: 30, mass: 0.6 },
  },
};

const collapsibleVariants = {
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { ...spring },
  },
  // BUG FIX (P0-#7): the old ease [0.4,0,1,1] is a strong ease-IN — the
  // height stays near its start value for the first 40% of the duration,
  // so the collapse appears to "pause" for ~88ms before starting. Replace
  // with ease-out so the collapse begins immediately and decelerates.
  // Opacity uses ease-out too so the content fades fast at the start.
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
      opacity: { duration: 0.14, ease: [0.16, 1, 0.3, 1] as const },
    },
  },
};

const promptVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.12, type: 'spring' as const, stiffness: 280, damping: 26, mass: 0.9 },
  },
};

const dotVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.1, type: 'spring' as const, stiffness: 500, damping: 22, mass: 0.6 },
  }),
};

// ─── Circular Progress Ring ──────────────────────────────────────────────────
//
// Replaces the old plain "{overallProgress}%" text with an SVG ring that
// matches the reference design's top-right progress indicator. Brand-colored
// stroke on a neutral track, with the percentage number in the center.

function CircularProgress({ value, size = 36 }: { value: number; size?: number }) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-neutral-200 dark:stroke-neutral-700"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="fill-none stroke-[var(--brand)]"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          // BUG FIX (P2-#34): stiffness 120 → 260 + damping 20 → 28. Old
          // config took ~1.2s to settle — felt sluggish when toggling
          // lesson status. New config settles in ~500ms.
          transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.7 }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <span className="absolute font-serif text-[10px] font-medium tabular-nums text-neutral-700 dark:text-neutral-300">
        {value}
      </span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeLabels: Record<CourseLesson['type'], string> = {
  theory: '理论',
  practice: '练习',
  quiz: '测验',
};

// Type chip colors — theory stays neutral, practice/quiz get a subtle brand tint
// to distinguish hands-on content from conceptual content (matching the
// reference design's colored type labels).
const typeChipColors: Record<CourseLesson['type'], string> = {
  theory: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  practice:
    'bg-[var(--brand)]/10 text-[var(--brand)] dark:bg-[var(--brand)]/15 dark:text-[var(--brand)]',
  quiz: 'bg-[var(--brand)]/10 text-[var(--brand)] dark:bg-[var(--brand)]/15 dark:text-[var(--brand)]',
};

// ─── Status Icon ──────────────────────────────────────────────────────────────
//
// Reference design uses three distinct icons: ✓ (completed, accent), ▶
// (in-progress, accent), 🔒 (locked, neutral). We keep MindGuide's filled-circle
// treatment for completed/active to preserve the brand identity, but simplify
// to match the reference's clean iconography.

function StatusIcon({ status }: { status: CourseLesson['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)]">
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      );
    case 'active':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)]">
          <Play className="h-2.5 w-2.5" fill="currentColor" />
        </div>
      );
    case 'available':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-neutral-300 dark:border-neutral-600">
          <Play className="h-2.5 w-2.5 text-neutral-400 dark:text-neutral-500" fill="currentColor" />
        </div>
      );
    case 'locked':
    default:
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          <Lock className="h-3.5 w-3.5 text-neutral-300 dark:text-neutral-600" />
        </div>
      );
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CoursePanel() {
  const {
    courseModules,
    coursePanelOpen,
    setCoursePanelOpen,
    activeLessonId,
    setActiveLessonId,
    updateLessonStatus,
    messages,
    isCourseGenerated,
    isGeneratingCourse,
    generateCourse,
  } = useLearningStore();

  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleModule = (moduleId: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    const allLessons = courseModules.flatMap((m) => m.lessons);
    if (allLessons.length === 0) return 0;
    const completed = allLessons.filter((l) => l.status === 'completed').length;
    return Math.round((completed / allLessons.length) * 100);
  }, [courseModules]);

  // Calculate module progress
  const getModuleProgress = (module: CourseModule) => {
    const completed = module.lessons.filter((l) => l.status === 'completed').length;
    return { completed, total: module.lessons.length, label: `${completed}/${module.lessons.length}` };
  };

  const handleLessonClick = (moduleId: string, lesson: CourseLesson) => {
    if (lesson.status === 'locked') return;

    if (lesson.status === 'available') {
      updateLessonStatus(moduleId, lesson.id, 'active');
    } else if (lesson.status === 'active') {
      updateLessonStatus(moduleId, lesson.id, 'completed');
    }
    // Allow toggling completed → active (undo), matching knowledge-node behavior
    else if (lesson.status === 'completed') {
      updateLessonStatus(moduleId, lesson.id, 'active');
    }
    setActiveLessonId(lesson.id);
  };

  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  const canGenerate = userMsgCount >= 3;

  // ESC to close (panel is now embedded in layout, not floating — no
  // click-outside-to-close needed).
  useEffect(() => {
    if (!coursePanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCoursePanelOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [coursePanelOpen, setCoursePanelOpen]);

  return (
    <AnimatePresence>
      {coursePanelOpen && (
        <motion.div
          key="course-panel"
          ref={panelRef}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="flex h-full w-full flex-col bg-white dark:bg-neutral-900"
          style={{ transformOrigin: 'right' }}
        >
            {!isCourseGenerated ? (
              /* ── Not yet generated: prompt to generate ── */
              <div className="flex h-full flex-col overflow-hidden rounded-2xl">
                {/* Header — minimal, with close button */}
                <div className="relative z-[41] flex h-14 shrink-0 items-center justify-between px-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                      <BookOpen className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                    </div>
                    <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                      课程
                    </h2>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.06, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
                    whileTap={{ scale: 0.94, transition: { type: 'spring', stiffness: 600, damping: 25 } }}
                    onClick={() => setCoursePanelOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    aria-label="关闭课程面板"
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                </div>

                <div className="mx-5 h-px bg-neutral-100 dark:bg-neutral-800/60" />

                {/* Prompt content */}
                <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
                  <LoadingOverlay active={isGeneratingCourse} label="正在分析学习状态..." blur />
                  <motion.div variants={promptVariants} initial="hidden" animate="visible" className="space-y-5">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800/80">
                      <Brain className="h-6 w-6 text-neutral-400 dark:text-neutral-500" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-[15px] font-medium text-neutral-800 dark:text-neutral-200">
                        AI 尚未了解你的学习状态
                      </h3>
                      <p className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                        {canGenerate
                          ? '通过对话，AI 已经初步了解你的思考方式。现在可以生成个性化课程了。'
                          : `继续与 AI 对话（还需至少 ${3 - userMsgCount} 条消息），让它了解你的学习水平和知识盲区。`}
                      </p>
                    </div>
                    <AnimatePresence mode="wait">
                      {canGenerate ? (
                        <motion.button
                          key="generate-btn"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8, transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] } }}
                          whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
                          whileTap={{ scale: 0.985, transition: { type: 'spring', stiffness: 600, damping: 25 } }}
                          onClick={generateCourse}
                          disabled={isGeneratingCourse}
                          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-2.5 text-[13px] font-medium text-[var(--brand-foreground)] shadow-md shadow-black/10 transition-all hover:shadow-lg hover:shadow-black/15 disabled:opacity-60"
                        >
                          {isGeneratingCourse ? (
                            <>
                              <InlineSpinner size="sm" className="border-neutral-300 dark:border-neutral-600 border-t-white dark:border-t-neutral-900" />
                              <span>生成中...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              <span>生成课程</span>
                            </>
                          )}
                        </motion.button>
                      ) : (
                        <motion.div
                          key="progress-dots"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, transition: { duration: 0.12 } }}
                          className="flex items-center justify-center gap-3"
                        >
                          {Array.from({ length: 3 }).map((_, i) => (
                            <motion.div
                              key={i}
                              custom={i}
                              variants={dotVariants}
                              initial="hidden"
                              animate="visible"
                              className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                                i < userMsgCount ? 'bg-[var(--brand)]' : 'bg-neutral-200 dark:bg-neutral-700'
                              }`}
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {!canGenerate && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.3 } }}
                        className="text-[11px] text-neutral-400 dark:text-neutral-500"
                      >
                        {userMsgCount} / 3 条消息
                      </motion.p>
                    )}
                  </motion.div>
                </div>
              </div>
            ) : (
              /* ── Course generated: clean editorial layout (reference design) ── */
              <div className="flex h-full flex-col overflow-hidden rounded-2xl">
                {/* Header with circular progress ring */}
                <div className="relative z-[41] flex h-14 shrink-0 items-center justify-between px-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                      <BookOpen className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                    </div>
                    <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                      课程
                    </h2>
                    <span className="ml-0.5 font-serif text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Lessons
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CircularProgress value={overallProgress} />
                    <motion.button
                      whileHover={{ scale: 1.06, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
                      whileTap={{ scale: 0.94, transition: { type: 'spring', stiffness: 600, damping: 25 } }}
                      onClick={() => setCoursePanelOpen(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      aria-label="关闭课程面板"
                    >
                      <X className="h-4 w-4" />
                    </motion.button>
                  </div>
                </div>

                <div className="mx-5 h-px bg-neutral-100 dark:bg-neutral-800/60" />

                {/* Module list */}
                <div className="relative flex-1 overflow-hidden">
                  <LoadingOverlay active={isGeneratingCourse} label="重新生成中..." blur />
                  <div className="h-full overflow-y-auto px-5 py-4 custom-scrollbar">
                    <motion.div
                      variants={moduleContainerVariants}
                      initial="hidden"
                      animate="visible"
                      className="space-y-1"
                    >
                      {courseModules.map((mod, modIdx) => {
                        const isCollapsed = collapsedModules.has(mod.id);
                        const progress = getModuleProgress(mod);
                        const isModuleComplete = progress.completed === progress.total;

                        return (
                          <motion.div key={mod.id} variants={moduleVariants} layout>
                            {/* Module header — clean row, no card bg */}
                            <button
                              onClick={() => toggleModule(mod.id)}
                              className="group flex w-full items-center gap-2.5 px-1 py-2.5 text-left transition-colors duration-150 hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                            >
                              <motion.div
                                animate={{ rotate: isCollapsed ? 0 : 90 }}
                                // BUG FIX (P1-#19): spring mass 0.8 caused the
                                // chevron to overshoot to ~95° then bounce back.
                                // Override with a critically-damped spring (no
                                // overshoot) for a clean 0→90° rotation.
                                transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.6 }}
                                className="flex h-4 w-4 shrink-0 items-center justify-center"
                              >
                                <ChevronDown className="h-3.5 w-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300" />
                              </motion.div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-serif text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                    Module {modIdx + 1}
                                  </span>
                                </div>
                                <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
                                  {mod.title}
                                </p>
                              </div>
                              {/* Module progress number — "X/Y" style from reference.
                                  P2-#36: when isModuleComplete, animate a scale pulse
                                  + the brand color so completion feels rewarding. */}
                              <motion.span
                                animate={isModuleComplete ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                                transition={isModuleComplete ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] } : {}}
                                className={`shrink-0 font-serif text-[12px] font-medium tabular-nums ${
                                  isModuleComplete
                                    ? 'text-[var(--brand)]'
                                    : 'text-neutral-400 dark:text-neutral-500'
                                }`}
                              >
                                {progress.label}
                              </motion.span>
                            </button>

                            {/* Lessons — flat list, no nested card */}
                            <AnimatePresence initial={false}>
                              {!isCollapsed && (
                                <motion.div
                                  variants={collapsibleVariants}
                                  initial="collapsed"
                                  animate="expanded"
                                  exit="collapsed"
                                  className="overflow-hidden"
                                >
                                  <motion.div
                                    variants={lessonContainerVariants}
                                    initial="hidden"
                                    animate="visible"
                                    className="ml-5 border-l border-neutral-100 dark:border-neutral-800"
                                  >
                                    {mod.lessons.map((lesson) => {
                                      const isActive = lesson.id === activeLessonId;
                                      const isLocked = lesson.status === 'locked';
                                      const isCompleted = lesson.status === 'completed';

                                      return (
                                        <motion.button
                                          key={lesson.id}
                                          variants={lessonVariants}
                                          whileHover={
                                            isLocked
                                              ? {}
                                              : {
                                                  // BUG FIX (P2-#35): 0.02 → 0.04 — old value was nearly invisible.
                                                  backgroundColor: 'rgba(0,0,0,0.04)',
                                                  transition: { duration: 0.15 },
                                                }
                                          }
                                          whileTap={
                                            isLocked
                                              ? {}
                                              : { scale: 0.99, transition: { type: 'spring', stiffness: 600, damping: 25 } }
                                          }
                                          onClick={() => handleLessonClick(mod.id, lesson)}
                                          disabled={isLocked}
                                          className={`group relative flex w-full items-center gap-3 pl-4 pr-1 py-2 text-left transition-all duration-150 ${
                                            isActive
                                              ? 'bg-[var(--brand)]/[0.04]'
                                              : isLocked
                                              ? 'cursor-not-allowed opacity-50'
                                              : ''
                                          }`}
                                        >
                                          {/* Active indicator — left accent bar */}
                                          {isActive && (
                                            <motion.div
                                              layoutId={`lesson-active-${mod.id}`}
                                              className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-[var(--brand)]"
                                            />
                                          )}

                                          <StatusIcon status={lesson.status} />

                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`truncate text-[13px] leading-tight transition-colors duration-150 ${
                                                isCompleted
                                                  ? 'text-neutral-400 dark:text-neutral-500'
                                                  : isActive
                                                  ? 'text-neutral-900 font-medium dark:text-neutral-100'
                                                  : 'text-neutral-700 dark:text-neutral-300'
                                              }`}
                                            >
                                              {lesson.title}
                                            </p>
                                          </div>

                                          {/* Type chip + duration */}
                                          <div className="flex shrink-0 items-center gap-2">
                                            <span
                                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${typeChipColors[lesson.type]}`}
                                            >
                                              {typeLabels[lesson.type]}
                                            </span>
                                            <span className="font-sans text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
                                              {lesson.duration}
                                            </span>
                                          </div>
                                        </motion.button>
                                      );
                                    })}
                                  </motion.div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </motion.div>

                    {/* Regenerate button — minimal footer */}
                    <div className="mt-5 px-1 pb-2">
                      <motion.button
                        whileHover={{ scale: 1.015, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
                        whileTap={{ scale: 0.975, transition: { type: 'spring', stiffness: 600, damping: 25 } }}
                        onClick={generateCourse}
                        disabled={isGeneratingCourse}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200/80 bg-white px-4 py-2.5 text-[13px] font-medium text-neutral-500 transition-all duration-150 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-50 dark:border-neutral-700/50 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-300"
                      >
                        {isGeneratingCourse ? (
                          <InlineSpinner size="sm" className="border-neutral-300 dark:border-neutral-600 border-t-neutral-500 dark:border-t-neutral-300" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        重新生成课程
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
