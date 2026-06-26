// ─── SM-2 Spaced Repetition Algorithm ──────────────────────────────────────
// Reference: P. Wozniak, "SuperMemo 2" (1987).
//
// Quality scale (0–5):
//   0 — complete blackout, "forgot"
//   1 — incorrect, but felt familiar
//   2 — incorrect, but easy to recall once shown
//   3 — correct, but with serious difficulty
//   4 — correct, after some hesitation
//   5 — perfect recall
//
// For UI simplicity we expose 4 buttons mapped to the standard quality
// buckets used by Anki-like clients:
//   "忘了" → 0, "困难" → 2, "良好" → 4, "简单" → 5
//
// Returns the next SM-2 state. The caller persists these fields verbatim.

export interface Sm2State {
  ease: number;        // ≥ 1.3
  interval: number;    // days
  repetition: number;  // consecutive correct
  dueAt: Date;
  lastReviewedAt: Date;
}

export interface Sm2Input {
  ease: number;
  interval: number;
  repetition: number;
}

export const SM2_QUALITY = {
  FORGOT: 0,
  HARD: 2,
  GOOD: 4,
  EASY: 5,
} as const;

export type Sm2Quality = typeof SM2_QUALITY[keyof typeof SM2_QUALITY];

export function sm2Next(state: Sm2Input, quality: number, now: Date = new Date()): Sm2State {
  let { ease, interval, repetition } = state;

  if (quality < 3) {
    // Lapse: reset repetitions, interval back to short, but keep ease (drop a bit).
    repetition = 0;
    interval = quality === 0 ? 0 : 1; // 0 days = due again same session
  } else {
    // Recall: advance.
    repetition += 1;
    if (repetition === 1) {
      interval = 1;
    } else if (repetition === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
  }

  // Update ease factor. SM-2 formula: EF' = EF + (0.1 - (5 - q)(0.08 + (5 - q) * 0.025))
  // Clamp to a minimum of 1.3 (SM-2 spec).
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.025);
  ease = Math.max(1.3, ease + delta);
  // Cap ease at 3.0 to avoid runaway intervals in a learning context.
  ease = Math.min(3.0, ease);

  const dueAt = new Date(now);
  // interval === 0 → due in 1 minute (same session, re-show soon).
  // interval >= 1  → due in `interval` days.
  dueAt.setTime(dueAt.getTime() + (interval === 0 ? 60_000 : interval * 86_400_000));

  return {
    ease: Math.round(ease * 100) / 100,
    interval,
    repetition,
    dueAt,
    lastReviewedAt: now,
  };
}

// Pretty-print an interval as a human label.
export function formatInterval(days: number): string {
  if (days <= 0) return '1 分钟';
  if (days === 1) return '1 天';
  if (days < 30) return `${days} 天`;
  if (days < 365) return `${Math.round(days / 30)} 个月`;
  return `${(days / 365).toFixed(1)} 年`;
}
