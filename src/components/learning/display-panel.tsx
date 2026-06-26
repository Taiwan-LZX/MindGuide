'use client';

import React from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useMotionTemplate,
  type Variants,
} from 'framer-motion';
import { MOTION } from '@/lib/motion-tokens';
import { Plus, X, Trash2, Settings, Eraser } from 'lucide-react';
import { useLearningStore } from '@/store/learning-store';

// ─── Animation Variants ────────────────────────────────────────────────────
//
// Personality: "command" — a utility menu, not a discovery surface.
//
// Differentiation rationale (vs. the 更多功能 / MoreFeaturesPanel):
//  · MoreFeatures is *discovery*: it reveals capabilities, so it uses a soft
//    spring (280/26/0.9) with overshoot, a slow cascade (35ms/row), a
//    cursor-follow spotlight and overshoot-bezier nudges — everything says
//    "explore me".
//  · This quick menu is *command*: the user has a clear intent (open settings,
//    new chat, clear, delete). They want it to feel snappy and unambiguous.
//    So we use:
//      – a stiffer, lighter spring (stiffness 380, damping 30, mass 0.6) —
//        settles in ~260ms with almost no overshoot, so it reads as "ready"
//        rather than "settling";
//      – a smaller entry cascade (30ms/row) so all four rows land nearly
//        together — utility menus should not make the user wait;
//      – transformOrigin 'top right' so the panel grows *out of* the
//        three-dot trigger and, on close, recedes back into it (the "exit
//        function transition" the user flagged as feeling off);
//      – a per-row icon tint (emerald / amber / red) so each command has its
//        own chromatic identity, distinguishing "create" / "clear" / "delete"
//        at a glance without relying on the label alone;
//      – a lighter cursor-follow spotlight than MoreFeatures (radius 80px vs
//        110px, weaker alpha) — present enough to feel alive, restrained
//        enough not to compete with the icon tint.

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.6 },
  },
  // Exit "recedes" toward the trigger (top-right). The small scale-down + y
  // up + opacity fade combo makes it read as "going back inside the dot"
  // rather than "vanishing".
  //
  // EXIT EASING (anim-refine-003 — "关闭的过渡动画无帧数直接闪现"):
  //   · Previous: single { duration: 0.22, ease: [0.4, 0, 1, 1] } for all 3
  //     properties. Strong ease-in meant opacity stayed near 1 for the first
  //     ~88ms (40% of 220ms) — combined with React commit delay, the user
  //     saw ~130ms of "nothing happening" then a sudden vanish.
  //   · Now: split per-property. Opacity uses ease-OUT [0.16, 1, 0.3, 1] so
  //     the menu visibly fades from frame 1. Scale + y keep ease-IN for the
  //     "receding into the trigger dot" metaphor but with shorter duration
  //     (0.18s) so they finish before opacity fully fades.
  //   · Total perceived duration ~200ms, with visible motion starting at
  //     frame 1 (vs ~frame 7 before).
  // EXIT = ENTER reversed: same target (hidden) + same spring.
  exit: {
    opacity: 0,
    scale: 0.94,
    y: -10,
    transition: MOTION.enterSoft,
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      // Tight 30ms cascade — utility menu, all rows land near-simultaneously.
      delay: 0.04 + 0.03 * i,
      type: 'spring',
      stiffness: 420,
      damping: 30,
      mass: 0.6,
    },
  }),
};

// Per-command icon tints. Applied on hover via group-hover so the tint
// chromatically signals intent (green=create, amber=caution, red=destroy).
// The neutral settings row stays ink-colored to read as "navigation".
type Intent = 'neutral' | 'create' | 'caution' | 'destroy';
const INTENT_TINT: Record<Intent, string> = {
  neutral: 'group-hover:text-neutral-700 dark:group-hover:text-neutral-200',
  create: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
  caution: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
  destroy: 'group-hover:text-red-600 dark:group-hover:text-red-400',
};

// ─── Action Row — cursor-follow spotlight + per-intent icon tint ──────────

function ActionRow({
  icon: Icon,
  label,
  danger,
  intent = 'neutral',
  onClick,
  index,
}: {
  icon: React.ElementType;
  label: string;
  danger?: boolean;
  intent?: Intent;
  onClick: () => void;
  index: number;
}) {
  // Cursor-follow spotlight — lighter than MoreFeatures (radius 80, alpha 0.04)
  const mouseX = useMotionValue(80);
  const mouseY = useMotionValue(16);
  // Stiffer spring → less lag (utility menu, wants immediacy)
  const smoothX = useSpring(mouseX, { stiffness: 420, damping: 32, mass: 0.4 });
  const smoothY = useSpring(mouseY, { stiffness: 420, damping: 32, mass: 0.4 });
  const spotlight = useMotionTemplate`radial-gradient(80px circle at ${smoothX}px ${smoothY}px, var(--row-spotlight), transparent 72%)`;

  return (
    <motion.button
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      whileHover={{
        x: 1.5,
        transition: { type: 'spring', stiffness: 480, damping: 26, mass: 0.5 },
      }}
      whileTap={{
        scale: 0.975,
        transition: { type: 'spring', stiffness: 700, damping: 30 },
      }}
      onClick={onClick}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 py-[7px] text-[13px] transition-colors duration-150 ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
          : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      {/* Base hover wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg bg-neutral-100/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-neutral-800/60"
      />
      {/* Cursor-follow spotlight — light mode */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:hidden"
        style={{
          background: spotlight,
          ['--row-spotlight' as string]: 'rgba(0,0,0,0.04)',
        }}
      />
      {/* Cursor-follow spotlight — dark mode */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:block"
        style={{
          background: spotlight,
          ['--row-spotlight' as string]: 'rgba(255,255,255,0.05)',
        }}
      />
      <Icon
        className={`relative z-10 h-[14px] w-[14px] shrink-0 opacity-60 transition-colors duration-200 ${INTENT_TINT[intent]}`}
      />
      <span className="relative z-10 flex-1 text-left">{label}</span>
    </motion.button>
  );
}

// ─── Quick Settings Menu (three-dot popover) ───────────────────────────────
// Triggered by the top-right three-dot button. Carries:
//   · a "设置" entry (opens full SettingsView)
//   · quick session actions: new / clear / delete
//
// The whole popover's transformOrigin is anchored to 'top right' so it grows
// out of the three-dot trigger on open and recedes back into it on close —
// the "exit transition" the user wanted polished.

export function SettingsPanel() {
  const {
    createSession,
    currentSessionId,
    deleteSession,
    settingsPanelOpen,
    setSettingsPanelOpen,
    setSettingsViewOpen,
  } = useLearningStore();

  const handleNewChat = async () => {
    await createSession('新的学习主题');
    setSettingsPanelOpen(false);
  };

  const handleClearChat = async () => {
    if (!currentSessionId) return;
    try {
      await fetch(`/api/sessions/${currentSessionId}/messages`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
    useLearningStore.setState({ messages: [] });
    setSettingsPanelOpen(false);
  };

  const handleDeleteChat = async () => {
    if (!currentSessionId) return;
    await deleteSession(currentSessionId);
    setSettingsPanelOpen(false);
  };

  const openSettings = () => {
    setSettingsPanelOpen(false);
    setSettingsViewOpen(true);
  };

  return (
    <AnimatePresence>
      {settingsPanelOpen && (
        <>
          {/* Backdrop — transparent click-catcher. Fades in/out so the click
              target doesn't pop.
              EXIT EASING (anim-refine-003): ease-out [0.16, 1, 0.3, 1] so the
              backdrop visibly fades from frame 1 (no dead-time window). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } }}
            className="fixed inset-0 z-[49]"
            onClick={() => setSettingsPanelOpen(false)}
          />

          {/* Panel — anchored top-right, transformOrigin matches trigger. */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: 'top right' }}
            className="fixed right-2 top-2 z-[50] w-[260px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12),0_2px_8px_-4px_rgba(0,0,0,0.08)] dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5),0_2px_8px_-4px_rgba(0,0,0,0.4)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <h2 className="text-[14px] font-medium text-neutral-800 dark:text-neutral-100">
                快捷菜单
              </h2>
              <motion.button
                whileHover={{
                  scale: 1.08,
                  transition: { type: 'spring', stiffness: 450, damping: 22, mass: 0.5 },
                }}
                whileTap={{
                  scale: 0.9,
                  transition: { type: 'spring', stiffness: 700, damping: 28 },
                }}
                onClick={() => setSettingsPanelOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                aria-label="关闭"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </motion.button>
            </div>

            {/* 设置 entry — opens the full detailed SettingsView. Gets its own
                intent tint (neutral) and the same spotlight behavior. */}
            <div className="px-2.5 py-2">
              <SettingsEntryRow onClick={openSettings} />
            </div>

            {/* Divider — inset to align with the action row padding. Animates
                scaleY (vertical menu) so it draws downward as the panel opens. */}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1, transition: { delay: 0.12, duration: 0.32, ease: [0.25, 0.1, 0.25, 1] } }}
              style={{ transformOrigin: 'top' }}
              className="mx-4 h-px origin-top bg-neutral-100 dark:bg-neutral-800"
            />

            {/* Quick session actions */}
            <div className="px-2.5 py-2">
              <ActionRow icon={Plus} label="创建新对话" intent="create" onClick={handleNewChat} index={1} />
              <ActionRow icon={Eraser} label="清空对话" intent="caution" onClick={handleClearChat} index={2} />
              {currentSessionId && (
                <ActionRow icon={Trash2} label="删除对话" danger intent="destroy" onClick={handleDeleteChat} index={3} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Settings Entry Row ────────────────────────────────────────────────────
// The "设置" row is a bit richer than the action rows (it has a hint suffix
// "主题 · 配色 · 布局") so it gets its own component to keep the layout clean.
// Shares the same cursor-follow spotlight + intent tint (neutral) as ActionRow.

function SettingsEntryRow({ onClick }: { onClick: () => void }) {
  const mouseX = useMotionValue(100);
  const mouseY = useMotionValue(16);
  const smoothX = useSpring(mouseX, { stiffness: 420, damping: 32, mass: 0.4 });
  const smoothY = useSpring(mouseY, { stiffness: 420, damping: 32, mass: 0.4 });
  const spotlight = useMotionTemplate`radial-gradient(90px circle at ${smoothX}px ${smoothY}px, var(--row-spotlight), transparent 72%)`;

  return (
    <motion.button
      custom={0}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      whileHover={{
        x: 1.5,
        transition: { type: 'spring', stiffness: 480, damping: 26, mass: 0.5 },
      }}
      whileTap={{
        scale: 0.975,
        transition: { type: 'spring', stiffness: 700, damping: 30 },
      }}
      onClick={onClick}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      className="group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition-colors duration-150 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      {/* Base hover wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg bg-neutral-100/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-neutral-800/60"
      />
      {/* Spotlight (light) */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:hidden"
        style={{
          background: spotlight,
          ['--row-spotlight' as string]: 'rgba(0,0,0,0.04)',
        }}
      />
      {/* Spotlight (dark) */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:block"
        style={{
          background: spotlight,
          ['--row-spotlight' as string]: 'rgba(255,255,255,0.05)',
        }}
      />
      <Settings className="relative z-10 h-[14px] w-[14px] shrink-0 opacity-70 transition-colors duration-200 group-hover:text-neutral-900 dark:group-hover:text-neutral-50" />
      <span className="relative z-10 flex-1 truncate text-left">设置</span>
      <span className="relative z-10 shrink-0 whitespace-nowrap text-[11px] text-neutral-400 dark:text-neutral-500">
        主题 · 配色 · 布局
      </span>
    </motion.button>
  );
}
