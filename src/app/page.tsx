'use client';

import React, { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useLearningStore } from '@/store/learning-store';
import { usePreferences } from '@/store/preferences-store';
import { Sidebar } from '@/components/learning/sidebar';
import { MainContent } from '@/components/learning/main-content';
import { FeatureView } from '@/components/learning/feature-views';
import { SettingsPanel } from '@/components/learning/display-panel';
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
  } = useLearningStore();
  const motionEnabled = usePreferences(s => s.motionEnabled);
  const hydratePrefs = usePreferences(s => s.hydrate);

  // Fetch sessions + stats on mount
  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [fetchSessions, fetchStats]);

  // Hydrate persisted display preferences (motion) on first mount.
  useEffect(() => {
    hydratePrefs();
  }, [hydratePrefs]);

  // Close settings panel on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsPanelOpen) {
        setSettingsPanelOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [settingsPanelOpen, setSettingsPanelOpen]);

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

          {/* Settings Panel (modal) */}
          <SettingsPanel />

          {/* Command Palette (⌘K) */}
          <CommandPalette />

          {/* Keyboard Shortcuts Overlay (?) */}
          <KeyboardShortcutsOverlay />
        </div>
      </div>
    </MotionConfig>
  );
}
