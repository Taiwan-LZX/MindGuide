'use client';

import React, { useEffect, useRef } from 'react';
import { MotionConfig, motion, AnimatePresence } from 'framer-motion';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { useLearningStore } from '@/store/learning-store';
import { usePreferences } from '@/store/preferences-store';
import { Sidebar } from '@/components/learning/sidebar';
import { MainContent } from '@/components/learning/main-content';
import { FeatureView, pageVariants } from '@/components/learning/feature-views';
import { SettingsPanel } from '@/components/learning/display-panel';
import { SettingsView } from '@/components/learning/settings-view';
import { MoreFeaturesPanel } from '@/components/learning/create-new-panel';
import { CoursePanel } from '@/components/learning/course-panel';
import { CommandPalette } from '@/components/learning/command-palette';
import { KeyboardShortcutsOverlay } from '@/components/learning/keyboard-shortcuts-overlay';
import { Focus } from 'lucide-react';

export default function Page() {
  const {
    sidebarOpen,
    displayMode,
    fetchSessions,
    fetchStats,
    activeFeatureView,
    activeFeatureViewDir,
    settingsPanelOpen,
    setSettingsPanelOpen,
    settingsViewOpen,
    setSettingsViewOpen,
    setSidebarOpen,
    setCreateNewPanelOpen,
    setActiveFeatureView,
    focusMode,
    toggleFocusMode,
  } = useLearningStore();
  const motionEnabled = usePreferences(s => s.motionEnabled);
  const accentColor = usePreferences(s => s.accentColor);
  const hydratePrefs = usePreferences(s => s.hydrate);

  // Fetch sessions + stats on mount
  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [fetchSessions, fetchStats]);

  // Hydrate persisted display preferences (motion + accent) on first mount.
  useEffect(() => {
    hydratePrefs();
  }, [hydratePrefs]);

  // Apply the user-chosen accent color as a CSS custom property on :root so any
  // element styled with `var(--brand)` picks it up. null = revert to the
  // neutral default declared in globals.css.
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) {
      root.style.setProperty('--brand', accentColor);
      // Derive a readable foreground from the accent's luminance. We can't call
      // the extraction helper here (it needs the RGB tuple), so use a simple
      // sRGB→luminance heuristic inline. For hex the parse is cheap.
      const hex = accentColor.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const lum =
          0.2126 * (r / 255 <= 0.03928 ? r / 255 / 12.92 : ((r / 255 + 0.055) / 1.055) ** 2.4) +
          0.7152 * (g / 255 <= 0.03928 ? g / 255 / 12.92 : ((g / 255 + 0.055) / 1.055) ** 2.4) +
          0.0722 * (b / 255 <= 0.03928 ? b / 255 / 12.92 : ((b / 255 + 0.055) / 1.055) ** 2.4);
        root.style.setProperty('--brand-foreground', lum > 0.45 ? '#0a0a0a' : '#fafafa');
      }
    } else {
      root.style.removeProperty('--brand');
      root.style.removeProperty('--brand-foreground');
    }
  }, [accentColor]);

  // Close quick menu / settings view on Escape. Also exit focus mode on
  // Escape (after settings layers are closed) — focus mode is the
  // "outermost" layer and should be exited last so ESC peels off layers in
  // the natural order: settings-view → settings-panel → focus-mode.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsViewOpen) setSettingsViewOpen(false);
        else if (settingsPanelOpen) setSettingsPanelOpen(false);
        else if (focusMode) toggleFocusMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [settingsPanelOpen, setSettingsPanelOpen, settingsViewOpen, setSettingsViewOpen, focusMode, toggleFocusMode]);

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  // Registers ⌘1-6 (feature jump), ⌘B (toggle sidebar), ⌘, (open settings)
  // globally — these were previously only active while the MoreFeaturesPanel
  // was open, which contradicted the keyboard-shortcuts-overlay promise that
  // they are always available. ⌘1-6 fire even when an input is focused (they
  // are navigation, not text input); ⌘B / ⌘, are suppressed inside editable
  // fields so the user can still type 'b' / ',' with the modifier if needed.
  useEffect(() => {
    const FEATURE_VIEWS = [
      'tasks',
      'cards',
      'progress',
      'graph',
      'notes',
      'materials',
    ] as const;
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable === true;

      // ⌘1-6: jump to a feature view (allowed even when typing — it's
      // navigation, not text insertion).
      if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        const view = FEATURE_VIEWS[idx];
        if (view) {
          setActiveFeatureView(view);
          setCreateNewPanelOpen(false);
        }
        return;
      }

      // ⌘E: toggle focus mode (allowed even when typing — the user may be
      // mid-composition and want to enter focus to write a longer message).
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        useLearningStore.getState().toggleFocusMode();
        return;
      }

      // ⌘B / ⌘, are suppressed inside editable fields to avoid hijacking
      // legitimate modifier+key combinations during text entry.
      if (isEditable) return;

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setSidebarOpen(!useLearningStore.getState().sidebarOpen);
        return;
      }
      if (e.key === ',') {
        e.preventDefault();
        setSettingsViewOpen(true);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setActiveFeatureView, setCreateNewPanelOpen, setSidebarOpen, setSettingsViewOpen, toggleFocusMode]);

  // Determine if sidebar should be shown. In focus mode the sidebar is
  // always hidden regardless of sidebarOpen (the focus toggle snapshots +
  // forces sidebarOpen=false, but we also guard here for safety).
  const showSidebar = !focusMode && displayMode !== 'full' && sidebarOpen;

  // Imperative ref to the sidebar Panel — lets us collapse/expand it
  // smoothly via react-resizable-panels' built-in animation instead of
  // unmounting/remounting the PanelGroup. This preserves the drag-resize
  // state AND gives a clean transition for focus mode / ⌘B toggle.
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  // Collapse/expand the sidebar Panel imperatively when showSidebar changes.
  // react-resizable-panels handles the width animation internally, so the
  // sidebar slides shut instead of hard-cutting.
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (showSidebar) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [showSidebar]);

  // viewDir comes from the store — see `activeFeatureViewDir` in
  // learning-store.ts. The store computes it atomically inside
  // setActiveFeatureView, so this component just reads it without any
  // setState-in-effect cascades (the lint-clean way to track derived state
  // from a store action).

  return (
    // MotionConfig: when the user disables 动态效果, force framer-motion into
    // reduced-motion mode app-wide. This strips transform/layout/scale springs
    // (the cursor-follow spring, panel scale-in, row stagger, hover scale…)
    // while leaving opacity animations intact. 'user' (when enabled) also
    // respects the OS prefers-reduced-motion setting.
    <MotionConfig reducedMotion={motionEnabled ? 'user' : 'always'}>
      <div className="relative flex h-dvh w-screen overflow-hidden bg-background">
        {/* ── Resizable panel group ───────────────────────────────────────
            Sidebar (collapsible, 200–480px) | Main content (flex).
            The handle is a 4px-wide transparent strip that reveals a brand
            accent bar on hover — subtle so it doesn't compete with content
            but discoverable when the user moves the cursor toward the seam.

            In focus mode the entire PanelGroup collapses to just the main
            content (sidebar hidden, no handle). */}
        {/* ── Layout: resizable sidebar + main content ─────────────────────
            The PanelGroup is ALWAYS rendered (never unmounted) so the
            drag-resize state persists. Focus mode / ⌘B toggle collapses the
            sidebar Panel imperatively via sidebarPanelRef — react-resizable-
            panels animates the width transition internally, so the sidebar
            slides shut smoothly instead of hard-cutting.

            BUG FIX (P0-#4/#5/#8): previously {showSidebar ? <PanelGroup> :
            <div>} hard-switched on focus mode, unmounting everything. Now
            the PanelGroup stays mounted and the sidebar Panel collapses/
            expands with built-in animation. Drag-resize is preserved. */}
        <PanelGroup direction="horizontal" autoSaveId="mindguide-layout">
          <Panel
            ref={sidebarPanelRef}
            id="sidebar"
            order={1}
            defaultSize={20}
            minSize={14}
            maxSize={32}
            collapsible
            collapsedSize={0}
            onCollapse={() => {
              // Sync store state when the panel collapses (e.g. user dragged
              // it to 0 or pressed the collapse arrow). Guard against
              // focusMode to avoid feedback loops.
              if (!focusMode && useLearningStore.getState().sidebarOpen) {
                setSidebarOpen(false);
              }
            }}
            onExpand={() => {
              if (!focusMode && !useLearningStore.getState().sidebarOpen) {
                setSidebarOpen(true);
              }
            }}
            className="h-full"
          >
            <Sidebar collapsed={false} />
          </Panel>
          <PanelResizeHandle
            className="group relative w-[3px] shrink-0 bg-transparent transition-colors hover:bg-[var(--brand)]/30 data-[resize-handle-state=drag]:bg-[var(--brand)]/50"
            aria-label="拖拽调整侧边栏宽度"
          >
            <div className="absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-200 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-neutral-700" />
          </PanelResizeHandle>
          <Panel id="main" order={2} defaultSize={80} minSize={50} className="h-full">
            <MainAreaContent
              activeFeatureView={activeFeatureView}
              activeFeatureViewDir={activeFeatureViewDir}
              focusMode={focusMode}
            />
          </Panel>
        </PanelGroup>

        {/* ── Focus mode indicator ───────────────────────────────────────
            A small pill at the top-center of the viewport that confirms the
            user is in focus mode and hints how to exit. Pointer-events-none
            so it never blocks clicks. */}
        <AnimatePresence>
          {focusMode && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 28 } }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
              className="pointer-events-none absolute left-1/2 top-3 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-neutral-200 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-neutral-600 shadow-md backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300"
              role="status"
              aria-live="polite"
            >
              <Focus className="h-3 w-3 text-[var(--brand)]" />
              <span>专注模式</span>
              <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 py-0.5 font-sans text-[9px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                Esc 退出
              </kbd>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

// ─── Main Area Content ──────────────────────────────────────────────────────
//
// Extracted so both the resizable-panel branch and the collapsed-sidebar
// branch render the exact same inner content (feature view transition +
// floating overlays). The focusMode flag is read by MainContent to enlarge
// the composer — see chat-composer.tsx for the corresponding CSS hooks.
function MainAreaContent({
  activeFeatureView,
  activeFeatureViewDir,
  focusMode,
}: {
  activeFeatureView: string | null;
  activeFeatureViewDir: 1 | -1;
  focusMode: boolean;
}) {
  return (
    <div
      className="relative flex h-full flex-1 flex-col overflow-hidden"
      data-focus-mode={focusMode ? 'on' : 'off'}
    >
      {/* ── Page-level view transition ──────────────────────────────────── */}
      <AnimatePresence mode="wait" custom={activeFeatureViewDir}>
        {activeFeatureView && !focusMode ? (
          <motion.div
            key={`feature-${activeFeatureView}`}
            custom={activeFeatureViewDir}
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative flex h-full flex-1 flex-col"
          >
            <FeatureView />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            custom={activeFeatureViewDir}
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative flex h-full flex-1 flex-col"
          >
            <MainContent />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Course Panel (floating, inside main area). Hidden in focus mode. */}
      {!focusMode && <CoursePanel />}

      {/* More Features Panel (popover) */}
      <MoreFeaturesPanel />

      {/* Quick Settings Menu (three-dot popover) */}
      <SettingsPanel />

      {/* Detailed Settings View (full-screen overlay) */}
      <SettingsView />

      {/* Command Palette (⌘K) */}
      <CommandPalette />

      {/* Keyboard Shortcuts Overlay (?) */}
      <KeyboardShortcutsOverlay />
    </div>
  );
}
