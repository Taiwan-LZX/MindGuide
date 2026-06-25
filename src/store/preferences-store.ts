'use client';

import { create } from 'zustand';

// ─── Preferences Store ─────────────────────────────────────────────────────
// User-level display preferences (not learning data). Persisted to localStorage
// so they survive reloads. Kept separate from learning-store to avoid coupling
// UI prefs with domain state.
//
// SSR-safety: the store defaults `motionEnabled` to `true` and `accentColor` to
// `null` so the server render and the first client render match. `hydrate()` is
// called on mount (in a useEffect) and overrides the defaults with the stored
// values — or, on first visit, with the inverse of the OS `prefers-reduced-motion`
// setting.

const STORAGE_KEY = 'mindguide:preferences';

export interface PersistedPreferences {
  motionEnabled: boolean;
  /** Hex string (e.g. "#3b82f6") or null for the neutral default. */
  accentColor: string | null;
}

interface PreferencesState {
  /** Whether decorative motion (springs, scales, fades) is enabled. */
  motionEnabled: boolean;
  /** User-chosen brand accent (hex) or null = neutral default. */
  accentColor: string | null;
  /** True after client-side hydration from localStorage. */
  hydrated: boolean;
  setMotionEnabled: (v: boolean) => void;
  setAccentColor: (v: string | null) => void;
  hydrate: () => void;
}

function persist(partial: Partial<PersistedPreferences>) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev: PersistedPreferences = raw
      ? { motionEnabled: true, accentColor: null, ...(JSON.parse(raw) as PersistedPreferences) }
      : { motionEnabled: true, accentColor: null };
    const next: PersistedPreferences = { ...prev, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  motionEnabled: true,
  accentColor: null,
  hydrated: false,
  setMotionEnabled: (v) => {
    set({ motionEnabled: v });
    persist({ motionEnabled: v });
  },
  setAccentColor: (v) => {
    set({ accentColor: v });
    persist({ accentColor: v });
  },
  hydrate: () => {
    if (typeof window === 'undefined' || get().hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let motionEnabled: boolean;
      let accentColor: string | null = null;
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedPreferences>;
        motionEnabled =
          typeof parsed.motionEnabled === 'boolean' ? parsed.motionEnabled : true;
        accentColor =
          typeof parsed.accentColor === 'string' ? parsed.accentColor : null;
      } else {
        // First visit: respect the OS reduced-motion preference.
        const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        motionEnabled = !osReduce;
      }
      set({ motionEnabled, accentColor, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
