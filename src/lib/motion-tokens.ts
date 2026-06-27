// ────────────────────────────────────────────────────────────────────────────
// motion-tokens.ts — shared framer-motion tokens
//
// DESIGN PRINCIPLE: "Exit = Enter reversed"
//   The exit animation is the enter animation played backwards. Same target
//   values (the `hidden` state), same spring physics. This gives:
//     • Perfect visual symmetry — what the user saw appear, they see disappear
//     • No dead-time window (spring starts moving immediately)
//     • No ghost trail (opacity + transform share the same curve)
//     • Predictable — the brain recognises "this is the opening in reverse"
//
// Previous approach (per-property split, snooze-out, ease-out exits) caused:
//   • opacity dropping to 0 while transform barely moved (scale 1→0.97 = 3%)
//   • element lingering in DOM at opacity 0 for ~80ms before unmount
//   • perceived as "卡顿/鬼影" (stuck then snap)
//
// The fix is simple: use the SAME spring transition for both enter and exit,
// and make exit target = hidden target. framer-motion runs the spring in
// reverse implicitly because the destination is the origin.
//
// Usage:
//   import { MOTION, panelMotion } from '@/lib/motion-tokens';
//   const variants = panelMotion;  // hidden/visible/exit all wired
//   // Or custom:
//   const v = {
//     hidden: { opacity: 0, scale: 0.96, y: 12 },
//     visible: { opacity: 1, scale: 1, y: 0, transition: MOTION.enter },
//     exit:    { opacity: 0, scale: 0.96, y: 12, transition: MOTION.enter },
//     //                          ^^^^^^^^^^^^^^^^^^^ same as hidden
//   };
// ────────────────────────────────────────────────────────────────────────────

// Standard easing curves (for tween fallbacks — backdrops, height anims).
export const EASE = {
  OUT: [0.16, 1, 0.3, 1] as const,
  IN: [0.4, 0, 1, 1] as const,
  INOUT: [0.25, 0.1, 0.25, 1] as const,
};

// Spring physics presets. Use the SAME preset for both enter and exit so the
// motion is symmetric. Pick by element size:
//   • DEFAULT — general UI (panels, dropdowns, cards)
//   • SOFT    — large modals (settings, course panel) — heavier feel
//   • SNAPPY  — small chips, icons, badges — quick
export const MOTION = {
  SPRING: { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.7 },
  SPRING_SOFT: { type: 'spring' as const, stiffness: 220, damping: 26, mass: 0.9 },
  SPRING_SNAPPY: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.6 },

  // Legacy aliases (kept so existing imports don't break) — same as SPRING*.
  // Prefer the SPRING* names in new code.
  SPRING_ENTER: { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.7 },
  SPRING_ENTER_SOFT: { type: 'spring' as const, stiffness: 220, damping: 26, mass: 0.9 },
  SPRING_ENTER_SNAPPY: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.6 },

  /** Default enter/exit transition — use for both. Spring, symmetric. */
  enter: { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.7 },
  enterSoft: { type: 'spring' as const, stiffness: 220, damping: 26, mass: 0.9 },
  enterSnappy: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.6 },

  /** Backdrop transition — opacity-only tween, symmetric enter/exit. */
  backdrop: { duration: 0.24, ease: EASE.INOUT },
  backdropExit: { duration: 0.2, ease: EASE.INOUT },

  // Legacy exit helpers (kept for back-compat with existing component code).
  // Internally these now return the SAME spring as enter — so exit mirrors enter.
  exitSplit(_opts?: { withScale?: boolean; withX?: boolean; withY?: boolean }) {
    return { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.7 };
  },
  exitFade(_duration?: number) {
    return { duration: 0.2, ease: EASE.INOUT };
  },

  // Legacy exit value constants (unused by new presets, kept for imports).
  EXIT_OPACITY: 0.16,
  EXIT_TRANSFORM: 0.14,
  EXIT_BACKDROP: 0.2,
  EXIT_Y: 4,
  EXIT_X: 14,
  EXIT_SCALE: 0.97,
} as const;

// ─── Variant presets ────────────────────────────────────────────────────────
// Each preset: hidden → visible (spring) → exit (SAME as hidden, SAME spring).
// Exit is literally the enter played in reverse. Symmetric, predictable, smooth.

/** Panel/modal — for settings, popovers, dialogs. Soft spring. */
export const panelMotion = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: MOTION.enterSoft,
  },
  // Exit = hidden values + same spring. Reverse of enter.
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 12,
    transition: MOTION.enterSoft,
  },
};

/** Dropdown/popover — for menus, search, tooltips. Default spring. */
export const dropdownMotion = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: MOTION.enter,
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.98,
    transition: MOTION.enter,
  },
};

/** Tab/page content slide — direction-aware. Pass `custom={dir}` (-1 back, +1 fwd). */
export const slideMotion = {
  hidden: (dir: number) => ({ opacity: 0, x: 18 * dir, y: 6 }),
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: MOTION.enter,
  },
  // Exit mirrors enter: slide OUT the opposite direction it slid IN.
  // If enter came from the right (dir=+1), exit goes to the left.
  exit: (dir: number) => ({
    opacity: 0,
    x: -18 * dir,
    y: -6,
    transition: MOTION.enter,
  }),
};

/** List item — for AnimatePresence mode="popLayout" add/remove. */
export const listItemMotion = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: MOTION.enter },
  exit: { opacity: 0, y: -8, transition: MOTION.enter },
};
