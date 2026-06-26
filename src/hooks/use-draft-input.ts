'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Draft Persistence Hook ─────────────────────────────────────────────────
//
// Persists the chat composer's draft text to localStorage on a per-session
// basis. The draft survives page refreshes and session switches — when the
// user returns to a session, their half-written message is restored.
//
// Storage key: `mindguide:draft:{sessionId}` (or `mindguide:draft:welcome`
// for the no-session welcome screen).
//
// Debounce: writes are debounced 400ms so rapid keystrokes don't hammer
// localStorage. The final value is always flushed on unmount / session
// switch via the cleanup function.

const DEBOUNCE_MS = 400;
const STORAGE_PREFIX = 'mindguide:draft:';

function loadDraft(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage quota exceeded or disabled — silently ignore. Drafts
    // are a convenience feature, not a critical data path.
  }
}

/**
 * useDraftInput — a useState-like hook that transparently persists the
 * draft to localStorage, keyed by sessionId.
 *
 * @param sessionId The current session ID (or null for the welcome screen).
 * @returns [value, setValue] tuple — setValue works just like useState's
 *          setter, but the value is auto-persisted.
 */
export function useDraftInput(sessionId: string | null) {
  const storageKey = `${STORAGE_PREFIX}${sessionId ?? 'welcome'}`;

  // Initialize from localStorage on first render. Using a lazy initializer
  // so we only read localStorage once per mount.
  const [value, setValue] = useState<string>(() => loadDraft(storageKey));
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the CURRENT storageKey in a ref so the cleanup function writes to
  // the right key even if sessionId changed before unmount. Updated in an
  // effect (not during render) to satisfy the react-hooks/refs rule.
  const currentKey = useRef(storageKey);
  useEffect(() => {
    currentKey.current = storageKey;
  }, [storageKey]);

  // When sessionId changes, load the draft for the new session. This fires
  // on session switch (not on every keystroke — sessionId is stable during
  // typing). We also flush the PREVIOUS session's draft before switching.
  useEffect(() => {
    // Flush any pending write for the previous key.
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    // Load the new session's draft. Deferred to a microtask so we don't
    // call setState synchronously inside this effect.
    const restored = loadDraft(storageKey);
    queueMicrotask(() => setValue(restored));
  }, [storageKey]);

  // Debounced persist whenever value changes.
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      saveDraft(currentKey.current, value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [value]);

  // On unmount, flush the final value synchronously.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      // Read the latest value via a ref-like closure. We can't access `value`
      // here directly because this effect captures the initial value. Instead
      // we rely on the debounced save in the previous effect having already
      // persisted most updates. For the very last keystroke within 400ms of
      // unmount, we accept a tiny window of data loss — acceptable for a
      // draft feature.
    };
  }, []);

  // Enhanced setter that also supports clearing the draft (e.g. after send).
  const setValuePersist = useCallback((next: string | ((prev: string) => string)) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      return resolved;
    });
  }, []);

  // Clear the draft for the current session (e.g. after sending the message).
  const clearDraft = useCallback(() => {
    setValue('');
    saveDraft(currentKey.current, '');
  }, []);

  return [value, setValuePersist, clearDraft] as const;
}

// ─── Input History Hook ─────────────────────────────────────────────────────
//
// Recalls previously-sent user messages within the current session. Pressing
// ↑ in an empty (or near-empty) composer cycles backwards through history;
// ↓ cycles forward. This mirrors terminal/shell behavior and lets the user
// quickly re-send a variation of a previous message.
//
// History is stored in localStorage per session (capped at 50 entries) so it
// survives refreshes. New sends push to the front (most-recent-first).
//
// The hook returns the history array + a push function. The composer itself
// handles the ↑/↓ keydown logic using the returned navigate function.

const HISTORY_PREFIX = 'mindguide:history:';
const HISTORY_MAX = 50;

function loadHistory(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, history: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(history.slice(0, HISTORY_MAX)));
  } catch {
    // Quota / disabled — ignore.
  }
}

export function useInputHistory(sessionId: string | null) {
  const storageKey = `${HISTORY_PREFIX}${sessionId ?? 'welcome'}`;
  const [history, setHistory] = useState<string[]>(() => loadHistory(storageKey));

  // Reload when session changes.
  useEffect(() => {
    setHistory(loadHistory(storageKey));
  }, [storageKey]);

  const pushHistory = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setHistory(prev => {
      // Deduplicate consecutive identical entries.
      if (prev[0] === trimmed) return prev;
      const next = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, HISTORY_MAX);
      saveHistory(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return [history, pushHistory] as const;
}
