'use client';

import { create } from 'zustand';

// ─── Preferences Store ─────────────────────────────────────────────────────
// User-level display preferences (not learning data). Persisted to localStorage
// so they survive reloads. Kept separate from learning-store to avoid coupling
// UI prefs with domain state.
//
// SSR-safety: the store defaults `motionEnabled` to `true` so the server render
// and the first client render match. `hydrate()` is called on mount (in a
// useEffect) and overrides the default with the stored value — or, on first
// visit, with the inverse of the OS `prefers-reduced-motion` setting.

const STORAGE_KEY = 'mindguide:preferences';

interface PreferencesState {
  /** Whether decorative motion (springs, scales, fades) is enabled. */
  motionEnabled: boolean;
  /** True after client-side hydration from localStorage. */
  hydrated: boolean;
  setMotionEnabled: (v: boolean) => void;
  hydrate: () => void;
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  motionEnabled: true,
  hydrated: false,
  setMotionEnabled: (v) => {
    set({ motionEnabled: v });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ motionEnabled: v }));
      } catch {
        /* ignore quota / privacy-mode errors */
      }
    }
  },
  hydrate: () => {
    if (typeof window === 'undefined' || get().hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let motionEnabled: boolean;
      if (raw) {
        const parsed = JSON.parse(raw);
        motionEnabled =
          typeof parsed.motionEnabled === 'boolean' ? parsed.motionEnabled : true;
      } else {
        // First visit: respect the OS reduced-motion preference.
        const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        motionEnabled = !osReduce;
      }
      set({ motionEnabled, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
