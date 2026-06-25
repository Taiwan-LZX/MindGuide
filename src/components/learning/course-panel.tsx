'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  Play,
  Lock,
  ChevronDown,
  BookOpen,
  Sparkles,
  Brain,
} from 'lucide-react';
import { useLearningStore, type CourseModule, type CourseLesson } from '@/store/learning-store';
import { InlineSpinner, LoadingSkeleton, LoadingOverlay } from '@/components/learning/loading-utils';

// ─── Shared Spring Config ────────────────────────────────────────────────────

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8 };

// ─── Animation Variants ─────────────────────────────────────────────────────
//
// Personality: "reveal" — the course panel is a sidebar that opens from the
// right side of the chat surface. It should feel like a drawer sliding in
// from the right (x:24 → 0) rather than a generic scale+fade. On close it
// slides back right (x:24 + opacity 0) so the exit reads as "putting the
// drawer away" — the exit-transition polish the user flagged.
//
// Differentiation vs. other panels:
//  · Quick menu (command): top-right dropdown, snappy 380/30/0.6.
//  · More features (discovery): bottom-left popover, soft 280/26/0.9.
//  · Settings (ceremony): centered modal, heavy 200/24/1.0.
//  · Course (reveal): right-side drawer, lateral 300/28/0.85, x-push not y.

/** Panel entrance: lateral slide-in from the right + soft scale. */
const panelVariants = {
  hidden: { opacity: 0, scale: 0.97, x: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 300, damping: 28, mass: 0.85 },
  },
  // Exit slides back toward the right edge (where the drawer came from).
  // transformOrigin: 'right' set inline on the panel so scale-down also
  // recedes rightward — the two cues agree directionally.
  //
  // EXIT EASING (anim-refine-003): split per-property. Opacity uses ease-OUT
  // so the drawer visibly fades from frame 1 (no dead-time window). Scale + x
  // keep ease-IN for the "sliding back into the right edge" metaphor but
  // finish slightly before opacity completes.
  exit: {
    opacity: 0,
    scale: 0.96,
    x: 24,
    transition: {
      opacity: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
      scale: { duration: 0.22, ease: [0.4, 0, 1, 1] },
      x: { duration: 0.24, ease: [0.4, 0, 1, 1] },
    },
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
    transition: { type: 'spring', stiffness: 300, damping: 28, mass: 0.8 },
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
    transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.6 },
  },
};

const collapsibleVariants = {
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { ...spring },
  },
  // Collapsing: opacity drops fast (ease-out) so the user sees the collapse
  // start immediately; height uses ease-in so it accelerates closed.
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.22, ease: [0.4, 0, 1, 1] },
      opacity: { duration: 0.14, ease: [0.16, 1, 0.3, 1] },
    },
  },
};

const promptVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { delay: 0.12, type: 'spring', stiffness: 280, damping: 26, mass: 0.9 },
  },
};

/** Staggered dot animation for the message threshold indicator */
const dotVariants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.1, type: 'spring', stiffness: 500, damping: 22, mass: 0.6 },
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeLabels: Record<CourseLesson['type'], string> = {
  theory: '理论',
  practice: '练习',
  quiz: '测验',
};

const typeColors: Record<CourseLesson['type'], string> = {
  theory: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  practice: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  quiz: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
};

function StatusIcon({ status }: { status: CourseLesson['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)]">
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      );
    case 'active':
    case 'available':
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-neutral-400 dark:border-neutral-500">
          <Play className="h-2.5 w-2.5 text-neutral-500 dark:text-neutral-400" fill="currentColor" />
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
    return `${completed}/${module.lessons.length}`;
  };

  const handleLessonClick = (moduleId: string, lesson: CourseLesson) => {
    if (lesson.status === 'locked') return;

    if (lesson.status === 'available') {
      updateLessonStatus(moduleId, lesson.id, 'active');
    } else if (lesson.status === 'active') {
      updateLessonStatus(moduleId, lesson.id, 'completed');
    }
    setActiveLessonId(lesson.id);
  };

  const userMsgCount = messages.filter((m) => m.role === 'user').length;
  const canGenerate = userMsgCount >= 3;

  return (
    <AnimatePresence>
      {coursePanelOpen && (
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative flex h-full w-[380px] shrink-0 flex-col m-2 rounded-2xl bg-white shadow-lg shadow-neutral-200/50 dark:bg-neutral-900/95 dark:shadow-black/20"
          style={{ maxHeight: 'calc(100% - 16px)', transformOrigin: 'right', willChange: 'transform, opacity' }}
        >
          {!isCourseGenerated ? (
            /* ── Not yet generated: prompt to generate ── */
            <div className="flex h-full flex-col overflow-hidden rounded-2xl">
              {/* Header — no harsh border, subtle separator */}
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
                  whileHover={{
                    scale: 1.06,
                    transition: { type: 'spring', stiffness: 400, damping: 22 },
                  }}
                  whileTap={{
                    scale: 0.94,
                    transition: { type: 'spring', stiffness: 600, damping: 25 },
                  }}
                  onClick={() => setCoursePanelOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="关闭课程面板"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>

              {/* Subtle divider */}
              <div className="mx-5 h-px bg-neutral-100 dark:bg-neutral-800/60" />

              {/* Prompt content */}
              <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
                {/* Shimmer overlay while generating */}
                <LoadingOverlay active={isGeneratingCourse} label="正在分析学习状态..." blur />

                <motion.div
                  variants={promptVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-5"
                >
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

                  {/* Generate button or progress dots */}
                  <AnimatePresence mode="wait">
                    {canGenerate ? (
                      <motion.button
                        key="generate-btn"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8, transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] } }}
                        whileHover={{
                          scale: 1.02,
                          transition: { type: 'spring', stiffness: 400, damping: 22 },
                        }}
                        whileTap={{
                          scale: 0.985,
                          transition: { type: 'spring', stiffness: 600, damping: 25 },
                        }}
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
                              i < userMsgCount
                                ? 'bg-[var(--brand)]'
                                : 'bg-neutral-200 dark:bg-neutral-700'
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
            /* ── Course generated: show modules ── */
            <div className="flex h-full flex-col overflow-hidden rounded-2xl">
              {/* Header with progress — subtle separation */}
              <div className="relative z-[41] flex h-14 shrink-0 items-center justify-between px-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    <BookOpen className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                  </div>
                  <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                    课程
                  </h2>
                  <span className="ml-1 text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                    {overallProgress}%
                  </span>
                </div>
                <motion.button
                  whileHover={{
                    scale: 1.06,
                    transition: { type: 'spring', stiffness: 400, damping: 22 },
                  }}
                  whileTap={{
                    scale: 0.94,
                    transition: { type: 'spring', stiffness: 600, damping: 25 },
                  }}
                  onClick={() => setCoursePanelOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="关闭课程面板"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>

              {/* Subtle divider */}
              <div className="mx-5 h-px bg-neutral-100 dark:bg-neutral-800/60" />

              {/* Module list with shimmer overlay while regenerating */}
              <div className="relative flex-1 overflow-hidden">
                <LoadingOverlay active={isGeneratingCourse} label="重新生成中..." blur />

                <div className="h-full overflow-y-auto px-3 py-4 custom-scrollbar">
                  <motion.div
                    variants={moduleContainerVariants}
                    initial="hidden"
                    animate="visible"
                    className="space-y-2.5"
                  >
                    {courseModules.map((mod) => {
                      const isCollapsed = collapsedModules.has(mod.id);
                      const progress = getModuleProgress(mod);

                      return (
                        <motion.div
                          key={mod.id}
                          variants={moduleVariants}
                          layout
                          className="overflow-hidden rounded-xl bg-neutral-50/80 shadow-sm shadow-neutral-200/40 dark:bg-neutral-800/60 dark:shadow-black/10"
                        >
                          {/* Module header */}
                          <button
                            onClick={() => toggleModule(mod.id)}
                            className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-white/60 dark:hover:bg-neutral-700/40"
                          >
                            <motion.div
                              animate={{ rotate: isCollapsed ? 0 : 90 }}
                              transition={spring}
                              className="flex h-5 w-5 shrink-0 items-center justify-center"
                            >
                              <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
                            </motion.div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                                {mod.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                                {progress} 已完成
                              </p>
                            </div>
                          </button>

                          {/* Lessons — inner floating cards */}
                          <AnimatePresence initial={false}>
                            {!isCollapsed && (
                              <motion.div
                                variants={collapsibleVariants}
                                initial="collapsed"
                                animate="expanded"
                                exit="collapsed"
                                className="overflow-hidden"
                              >
                                <div className="mx-2.5 mb-2.5 rounded-lg bg-white/90 shadow-sm shadow-neutral-200/30 dark:bg-neutral-800/90 dark:shadow-black/10">
                                  <motion.div
                                    variants={lessonContainerVariants}
                                    initial="hidden"
                                    animate="visible"
                                    className="divide-y divide-neutral-100 px-1 py-1 dark:divide-neutral-700/50"
                                  >
                                    {mod.lessons.map((lesson) => {
                                      const isActive = lesson.id === activeLessonId;
                                      const isLocked = lesson.status === 'locked';

                                      return (
                                        <motion.button
                                          key={lesson.id}
                                          variants={lessonVariants}
                                          whileHover={isLocked ? {} : {
                                            x: 2,
                                            transition: { type: 'spring', stiffness: 400, damping: 22 },
                                          }}
                                          whileTap={isLocked ? {} : {
                                            scale: 0.985,
                                            transition: { type: 'spring', stiffness: 600, damping: 25 },
                                          }}
                                          onClick={() => handleLessonClick(mod.id, lesson)}
                                          disabled={isLocked}
                                          className={`group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-all duration-150 ${
                                            isActive
                                              ? 'bg-neutral-100/80 shadow-sm shadow-neutral-200/20 dark:bg-neutral-700/50 dark:shadow-black/10 border-l-2 border-[var(--brand)]'
                                              : isLocked
                                              ? 'cursor-not-allowed opacity-40'
                                              : 'hover:bg-neutral-50/80 dark:hover:bg-neutral-700/30'
                                          }`}
                                        >
                                          <StatusIcon status={lesson.status} />

                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`truncate text-[13px] leading-tight transition-colors duration-150 ${
                                                lesson.status === 'completed'
                                                  ? 'text-neutral-400 line-through dark:text-neutral-500'
                                                  : isActive
                                                  ? 'text-neutral-900 font-medium dark:text-neutral-100'
                                                  : 'text-neutral-700 dark:text-neutral-300'
                                              }`}
                                            >
                                              {lesson.title}
                                            </p>
                                          </div>

                                          <div className="flex shrink-0 items-center gap-2">
                                            <span
                                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                                                typeColors[lesson.type]
                                              }`}
                                            >
                                              {typeLabels[lesson.type]}
                                            </span>
                                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                                              {lesson.duration}
                                            </span>
                                          </div>
                                        </motion.button>
                                      );
                                    })}
                                  </motion.div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  {/* Regenerate button */}
                  <div className="mt-4 px-1 pb-2">
                    <motion.button
                      whileHover={{
                        scale: 1.015,
                        transition: { type: 'spring', stiffness: 400, damping: 22 },
                      }}
                      whileTap={{
                        scale: 0.975,
                        transition: { type: 'spring', stiffness: 600, damping: 25 },
                      }}
                      onClick={generateCourse}
                      disabled={isGeneratingCourse}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200/80 bg-white/80 px-4 py-2.5 text-[13px] font-medium text-neutral-500 shadow-sm shadow-neutral-200/30 transition-all duration-150 hover:bg-neutral-50 hover:text-neutral-700 hover:shadow-md disabled:opacity-50 dark:border-neutral-700/50 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-300 dark:shadow-black/10"
                    >
                      {isGeneratingCourse ? (
                        <InlineSpinner size="sm" className="border-neutral-300 dark:border-neutral-600 border-t-neutral-500 dark:border-t-neutral-300" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
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