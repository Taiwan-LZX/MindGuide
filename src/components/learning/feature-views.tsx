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
  StickyNote,
} from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';
// PDFImportView removed during cleanup — feature replaced with notes editor
import TiptapEditor from '@/components/learning/tiptap-editor';

// ─── Animation Variants ─────────────────────────────────────────────────────

const pageVariants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.04 * i, duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ─── Feature View Router ─────────────────────────────────────────────────────

export function FeatureView() {
  const { activeFeatureView } = useLearningStore();

  return (
    <AnimatePresence mode="wait">
      {activeFeatureView && (
        <motion.div
          key={activeFeatureView}
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="flex h-full flex-1 flex-col"
        >
          {/* PDF import removed during cleanup */}
          {activeFeatureView === 'tasks' && <TaskPlannerView />}
          {activeFeatureView === 'cards' && <LearningCardsView />}
          {activeFeatureView === 'achievements' && <AchievementsView />}
          {activeFeatureView === 'stats' && <StatsView />}
          {activeFeatureView === 'graph' && <KnowledgeGraphView />}
          {activeFeatureView === 'notes' && <NotesView />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Shared Header ──────────────────────────────────────────────────────────

function FeatureHeader({ title, icon: Icon, color }: { title: string; icon: React.ElementType; color: string }) {
  const { setActiveFeatureView } = useLearningStore();

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 px-6 dark:border-neutral-800">
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setActiveFeatureView(null)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      >
        <ArrowLeft className="h-4 w-4" />
      </motion.button>
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <h1 className="text-[15px] font-medium text-neutral-900 dark:text-neutral-100">{title}</h1>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.35 }}
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

function TaskPlannerView() {
  const { tasks, addTask, toggleTask, deleteTask } = useLearningStore();
  const [newTask, setNewTask] = React.useState('');

  const doneCount = tasks.filter(t => t.done).length;
  const pct = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0;

  return (
    <>
      <FeatureHeader title="任务规划" icon={Check} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div className="flex-1 overflow-y-auto custom-scrollbar">
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

          {/* Add task */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }}
            className="mb-4 flex gap-2"
          >
            <input
              type="text"
              placeholder="添加学习任务..."
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { addTask(newTask.trim()); setNewTask(''); } }}
              className="h-9 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] transition-colors duration-150 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => { if (newTask.trim()) { addTask(newTask.trim()); setNewTask(''); } }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            >
              <Plus className="h-4 w-4" />
            </motion.button>
          </motion.div>

          {/* Task list */}
          <AnimatePresence mode="popLayout" initial={false}>
            {tasks.length === 0 && <EmptyState icon={Check} title="暂无任务" description="添加学习任务来规划你的学习路径" />}
            {tasks.map((task, i) => (
              <motion.div
                key={task.id}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.15 } }}
                layout
                className={`group mb-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  task.done ? 'bg-neutral-50 dark:bg-neutral-800/50' : 'bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800/50'
                }`}
              >
                <motion.button
                  whileTap={{ scale: 0.8 }}
                  onClick={() => toggleTask(task.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    task.done
                      ? 'border-neutral-700 bg-neutral-700 text-white dark:border-neutral-300 dark:bg-neutral-300 dark:text-neutral-900'
                      : 'border-neutral-300 dark:border-neutral-600'
                  }`}
                >
                  {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </motion.button>
                <span className={`flex-1 text-[13px] ${task.done ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-700 dark:text-neutral-200'}`}>
                  {task.title}
                </span>
                <motion.button
                  whileTap={{ scale: 0.8 }}
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                >
                  <Trash2 className="h-3 w-3" />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ─── 3. Learning Cards View ────────────────────────────────────────────────

function LearningCardsView() {
  const { cards, addCard, toggleCardMastered } = useLearningStore();
  const [front, setFront] = React.useState('');
  const [back, setBack] = React.useState('');
  const [flipped, setFlipped] = React.useState<string | null>(null);

  const masteredCount = cards.filter(c => c.mastered).length;

  return (
    <>
      <FeatureHeader title="学习卡片" icon={RotateCcw} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Stats bar */}
        <div className="shrink-0 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
          <div className="mx-auto flex max-w-[600px] items-center justify-between text-[12px] text-neutral-400">
            <span>{cards.length} 张卡片</span>
            <span>{masteredCount} 已掌握</span>
          </div>
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          <div className="mx-auto grid max-w-[600px] grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {cards.length === 0 && (
                <EmptyState key="empty" icon={RotateCcw} title="暂无卡片" description="创建闪卡来强化记忆" />
              )}
              {cards.map((card, i) => (
                <motion.div
                  key={card.id}
                  custom={i}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  layout
                  onClick={() => setFlipped(flipped === card.id ? null : card.id)}
                  className={`flex min-h-[120px] cursor-pointer flex-col justify-between rounded-xl border p-3 transition-all ${
                    card.mastered
                      ? 'border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600'
                  }`}
                >
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
                    <span className="text-[11px] text-neutral-400">{card.category}</span>
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={e => { e.stopPropagation(); toggleCardMastered(card.id); }}
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        card.mastered ? 'border-neutral-700 bg-neutral-700 text-white dark:border-neutral-300 dark:bg-neutral-300 dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600'
                      }`}
                    >
                      {card.mastered && <Check className="h-3 w-3" strokeWidth={3} />}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
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
                onKeyDown={e => {
                  if (e.key === 'Enter' && front.trim() && back.trim()) {
                    addCard(front.trim(), back.trim());
                    setFront('');
                    setBack('');
                  }
                }}
                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-[12px] transition-colors duration-150 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              />
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (front.trim() && back.trim()) {
                    addCard(front.trim(), back.trim());
                    setFront('');
                    setBack('');
                  }
                }}
                className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-neutral-900 py-1.5 text-[12px] font-medium text-white dark:bg-white dark:text-neutral-900"
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

function AchievementsView() {
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
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">
          {/* Summary with circular progress */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 overflow-hidden rounded-xl border border-neutral-200/60 bg-gradient-to-br from-neutral-50 to-white p-4 dark:border-neutral-800/60 dark:from-neutral-900/80 dark:to-neutral-900/40"
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
                  {isLoadingStats ? '统计中...' : (unlockedCount === achievements.length ? '🏆 全部解锁！恭喜！' : '继续学习来解锁更多成就')}
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
                    className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all ${
                      ach.unlocked
                        ? 'border-neutral-300 bg-gradient-to-r from-neutral-50/80 to-transparent dark:border-neutral-700 dark:from-neutral-800/40'
                        : 'border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                  >
                    <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                      ach.unlocked
                        ? 'bg-neutral-800 text-white shadow-md shadow-neutral-900/20 dark:bg-neutral-200 dark:text-neutral-900'
                        : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                    }`}>
                      {ach.unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                      {ach.unlocked && (
                        <motion.span
                          initial={{ scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 0.2, type: 'spring', stiffness: 400, damping: 18 }}
                          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white"
                        >
                          <Check className="h-2 w-2" strokeWidth={4} />
                        </motion.span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${ach.unlocked ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'}`}>
                        {ach.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">{ach.description}</p>
                    </div>
                    <div className="shrink-0">
                      {ach.unlocked ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">✓ 已解锁</span>
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

function StatsView() {
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
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[600px] px-6 py-5">
          {/* Hero metric: current streak */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 overflow-hidden rounded-xl border border-neutral-200/60 bg-gradient-to-br from-neutral-50 via-white to-neutral-50 p-5 dark:border-neutral-800/60 dark:from-neutral-900 dark:via-neutral-900/80 dark:to-neutral-900"
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
                  {(stats?.currentStreak ?? 0) >= 3 ? '🔥 保持下去！' : '继续学习来培养习惯'}
                </p>
              </div>
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 15 }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-lg shadow-neutral-900/20 dark:bg-neutral-100 dark:text-neutral-900 dark:shadow-neutral-100/10"
              >
                <Flame className="h-7 w-7" />
              </motion.div>
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
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
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

function KnowledgeGraphView() {
  const { knowledgeNodes } = useLearningStore();

  return (
    <>
      <FeatureHeader title="知识图谱" icon={Layers} color="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" />
      <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold ${
                      node.mastered
                        ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'
                        : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                    }`}>
                      {node.mastered ? '✓' : '○'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-medium text-neutral-700 dark:text-neutral-200">{node.title}</p>
                      {node.category && <p className="text-[11px] text-neutral-400">{node.category}</p>}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      重要度 {'●'.repeat(Math.min(node.importance, 5))}{'○'.repeat(Math.max(5 - node.importance, 0))}
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
