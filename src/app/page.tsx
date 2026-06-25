'use client';

import React, { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useLearningStore } from '@/store/learning-store';
import { usePreferences } from '@/store/preferences-store';
import { Sidebar } from '@/components/learning/sidebar';
import { MainContent } from '@/components/learning/main-content';
import { FeatureView } from '@/components/learning/feature-views';
import { SettingsPanel } from '@/components/learning/display-panel';
import { SettingsView } from '@/components/learning/settings-view';
import { MoreFeaturesPanel } from '@/components/learning/create-new-panel';
import { CoursePanel } from '@/components/learning/course-panel';
import { CommandPalette } from '@/components/learning/command-palette';
import { KeyboardShortcutsOverlay } from '@/components/learning/keyboard-shortcuts-overlay';

export default function Page() {
  const {
    sidebarOpen,
    displayMode,
    fetchSessions,
    fetchStats,
    activeFeatureView,
    settingsPanelOpen,
    setSettingsPanelOpen,
    settingsViewOpen,
    setSettingsViewOpen,
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

  // Close quick menu / settings view on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsViewOpen) setSettingsViewOpen(false);
        else if (settingsPanelOpen) setSettingsPanelOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [settingsPanelOpen, setSettingsPanelOpen, settingsViewOpen, setSettingsViewOpen]);

  // Determine if sidebar should be shown
  const showSidebar = displayMode !== 'full' && sidebarOpen;

  return (
    // MotionConfig: when the user disables 动态效果, force framer-motion into
    // reduced-motion mode app-wide. This strips transform/layout/scale springs
    // (the cursor-follow spring, panel scale-in, row stagger, hover scale…)
    // while leaving opacity animations intact. 'user' (when enabled) also
    // respects the OS prefers-reduced-motion setting.
    <MotionConfig reducedMotion={motionEnabled ? 'user' : 'always'}>
      <div className="flex h-dvh w-screen overflow-hidden bg-background">
        {/* Sidebar */}
        {showSidebar && <Sidebar collapsed={false} />}
        {!showSidebar && displayMode !== 'full' && <Sidebar collapsed={true} />}

        {/* Main content area */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Feature views or main content */}
          {activeFeatureView ? <FeatureView /> : <MainContent />}

          {/* Course Panel (floating, inside main area) */}
          <CoursePanel />

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
      </div>
    </MotionConfig>
  );
}
