'use client';

import React, { useEffect } from 'react';
import { useLearningStore } from '@/store/learning-store';
import { Sidebar } from '@/components/learning/sidebar';
import { MainContent } from '@/components/learning/main-content';
import { FeatureView } from '@/components/learning/feature-views';
import { SettingsPanel } from '@/components/learning/display-panel';
import { MoreFeaturesPanel } from '@/components/learning/create-new-panel';
import { CoursePanel } from '@/components/learning/course-panel';

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

  // Fetch sessions + stats on mount
  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [fetchSessions, fetchStats]);

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
      </div>
    </div>
  );
}
