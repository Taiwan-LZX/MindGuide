import { create } from 'zustand';
import { stripEmoji } from '@/lib/emoji-sanitize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LearningSession {
  id: string;
  title: string;
  description?: string | null;
  topic?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'dialogue' | 'question' | 'explanation' | 'summary' | 'encouragement' | 'follow_up';
  thinking?: string | null;
  createdAt: string;
}

export interface KnowledgeNode {
  id: string;
  sessionId: string;
  title: string;
  content: string;
  category?: string | null;
  importance: number;
  mastered: boolean;
  tags?: string | null;
  createdAt: string;
}

export interface Reference {
  id: string;
  sessionId: string;
  title: string;
  url?: string | null;
  type: string;
  note?: string | null;
  createdAt: string;
}

export interface CourseLesson {
  id: string;
  moduleId: string;
  title: string;
  type: 'theory' | 'practice' | 'quiz';
  duration: string;
  status: 'locked' | 'available' | 'active' | 'completed';
  content: string;
  order: number;
}

export interface CourseModule {
  id: string;
  sessionId: string;
  title: string;
  order: number;
  lessons: CourseLesson[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}

export interface WeeklyActivityItem {
  label: string;
  count: number;
}

export interface LearningStats {
  sessions: number;
  messages: number;
  userMessages: number;
  knowledgeNodes: number;
  masteredKnowledge: number;
  learningTimeLabel: string;
  maxRoundsInOneSession: number;
  currentStreak: number;
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface LearningStore {
  // Sessions
  sessions: LearningSession[];
  currentSessionId: string | null;
  isLoading: boolean;

  // Messages
  messages: LearningMessage[];
  isLoadingMessages: boolean;
  isStreaming: boolean;
  streamingContent: string;

  // Knowledge
  knowledgeNodes: KnowledgeNode[];
  references: Reference[];

  // Course state
  coursePanelOpen: boolean;
  courseModules: CourseModule[];
  activeLessonId: string | null;
  isCourseGenerated: boolean;
  isGeneratingCourse: boolean;

  // UI state
  sidebarOpen: boolean;
  knowledgePanelOpen: boolean;
  displayMode: 'side' | 'half' | 'full';
  settingsPanelOpen: boolean;
  createNewPanelOpen: boolean;
  activeFeatureView: string | null;

  // Feature state
  tasks: Array<{ id: string; title: string; done: boolean; priority: number; createdAt: string }>;
  cards: Array<{ id: string; front: string; back: string; category: string; mastered: boolean; createdAt: string }>;
  isLoadingTasks: boolean;
  isLoadingCards: boolean;
  achievements: Achievement[];

  // Stats state
  stats: LearningStats | null;
  weeklyActivity: WeeklyActivityItem[];
  isLoadingStats: boolean;

  // Notes state
  notesContent: string;
  notesPanelOpen: boolean;
  isSavingNotes: boolean;
  notesSaveStatus: 'idle' | 'saving' | 'saved' | 'error';

  // Actions - Sessions
  fetchSessions: () => Promise<void>;
  createSession: (title: string, topic?: string) => Promise<LearningSession | null>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;

  // Actions - Messages
  sendMessage: (content: string) => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;

  // Actions - Knowledge
  fetchKnowledgeNodes: (sessionId: string) => Promise<void>;
  fetchReferences: (sessionId: string) => Promise<void>;
  toggleKnowledgeMastered: (nodeId: string) => Promise<void>;

  // Actions - Course
  setCoursePanelOpen: (open: boolean) => void;
  setActiveLessonId: (id: string | null) => void;
  generateCourse: () => Promise<void>;
  fetchCourse: (sessionId: string) => Promise<void>;
  updateLessonStatus: (moduleId: string, lessonId: string, status: CourseLesson['status']) => void;

  // Actions - Notes
  fetchNotes: (sessionId: string) => Promise<void>;
  saveNotes: (sessionId: string, content: string) => Promise<void>;
  setNotesContent: (content: string) => void;
  setNotesPanelOpen: (open: boolean) => void;

  // Actions - Stats
  fetchStats: () => Promise<void>;

  // Actions - UI
  setSidebarOpen: (open: boolean) => void;
  setKnowledgePanelOpen: (open: boolean) => void;
  setDisplayMode: (mode: 'side' | 'half' | 'full') => void;
  setSettingsPanelOpen: (open: boolean) => void;
  setCreateNewPanelOpen: (open: boolean) => void;
  setActiveFeatureView: (view: string | null) => void;
  fetchTasks: (sessionId: string) => Promise<void>;
  addTask: (title: string, priority?: number) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  fetchCards: (sessionId: string) => Promise<void>;
  addCard: (front: string, back: string, category?: string) => Promise<void>;
  toggleCardMastered: (id: string) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  reset: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const initialStats: LearningStats = {
  sessions: 0,
  messages: 0,
  userMessages: 0,
  knowledgeNodes: 0,
  masteredKnowledge: 0,
  learningTimeLabel: '0m',
  maxRoundsInOneSession: 0,
  currentStreak: 0,
};

const initialState = {
  sessions: [] as LearningSession[],
  currentSessionId: null as string | null,
  isLoading: false,
  messages: [] as LearningMessage[],
  isLoadingMessages: false,
  isStreaming: false,
  streamingContent: '',
  knowledgeNodes: [] as KnowledgeNode[],
  references: [] as Reference[],
  coursePanelOpen: false,
  courseModules: [] as CourseModule[],
  activeLessonId: null as string | null,
  isCourseGenerated: false,
  isGeneratingCourse: false,
  sidebarOpen: true,
  knowledgePanelOpen: true,
  displayMode: 'side' as const,
  settingsPanelOpen: false,
  createNewPanelOpen: false,
  activeFeatureView: null as string | null,
  tasks: [] as Array<{ id: string; title: string; done: boolean; priority: number; createdAt: string }>,
  cards: [] as Array<{ id: string; front: string; back: string; category: string; mastered: boolean; createdAt: string }>,
  isLoadingTasks: false,
  isLoadingCards: false,
  notesContent: '',
  notesPanelOpen: false,
  isSavingNotes: false,
  notesSaveStatus: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
  stats: initialStats,
  weeklyActivity: [] as WeeklyActivityItem[],
  isLoadingStats: false,
  achievements: [] as Achievement[],
};

// ─── Notes Save Debounce Tracker ────────────────────────────────────────────
// Module-level timer to debounce notes auto-save across store instances
let notesSaveTimer: ReturnType<typeof setTimeout> | null = null;
const NOTES_SAVE_DELAY_MS = 800;

// ─── Achievement Unlock Tracking ────────────────────────────────────────────
// Persisted set of achievement IDs the user has already unlocked, so we can
// detect newly-unlocked achievements across page reloads and trigger toasts.
const UNLOCKED_ACH_KEY = 'mindguide:unlocked-achievements';
function loadUnlockedAchievements(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(UNLOCKED_ACH_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
function saveUnlockedAchievements(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UNLOCKED_ACH_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota errors
  }
}
// In-memory snapshot so we don't re-read localStorage on every fetchStats
let knownUnlocked = loadUnlockedAchievements();

// ─── Store ──────────────────────────────────────────────────────────────────

export const useLearningStore = create<LearningStore>((set, get) => ({
  ...initialState,

  // ── Sessions ──────────────────────────────────────────────────────────────

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) { console.error('fetchSessions failed:', res.status); return; }
      const data = await res.json();
      set({ sessions: data.sessions || [] });
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createSession: async (title: string, topic?: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, topic }),
      });
      if (!res.ok) { console.error('createSession failed:', res.status); return null; }
      const data = await res.json();
      if (data.session) {
        set((state) => ({
          sessions: [data.session, ...state.sessions],
        }));
        await get().selectSession(data.session.id);
        return data.session;
      }
      return null;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  },

  selectSession: async (id: string) => {
    // Preserve notes save state from previous session if needed
    set({
      currentSessionId: id,
      // Returning to a conversation should always show the chat view, not
      // whatever feature view (notes/stats/etc.) was open before.
      activeFeatureView: null,
      messages: [],
      knowledgeNodes: [],
      references: [],
      courseModules: [],
      isCourseGenerated: false,
      notesContent: '',
      notesSaveStatus: 'idle',
      tasks: [],
      cards: [],
    });
    await Promise.all([
      get().fetchMessages(id),
      get().fetchKnowledgeNodes(id),
      get().fetchReferences(id),
      get().fetchCourse(id),
      get().fetchNotes(id),
      get().fetchTasks(id),
      get().fetchCards(id),
    ]);
  },

  deleteSession: async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) { console.error('deleteSession failed:', res.status); return; }
      const { currentSessionId, sessions } = get();
      const isCurrent = currentSessionId === id;
      set({
        sessions: sessions.filter((s) => s.id !== id),
        currentSessionId: isCurrent ? null : currentSessionId,
        // Also clear related data when deleting current session
        ...(isCurrent ? {
          messages: [],
          knowledgeNodes: [],
          references: [],
          courseModules: [],
          isCourseGenerated: false,
          notesContent: '',
        } : {}),
      });
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  },

  updateSessionTitle: async (id: string, title: string) => {
    if (!title.trim()) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim().slice(0, 100) }),
      });
      if (!res.ok) { console.error('updateSessionTitle failed:', res.status); return; }
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, title: title.trim().slice(0, 100) } : s
        ),
      }));
    } catch (error) {
      console.error('Failed to update session title:', error);
    }
  },

  // ── Messages ───────────────────────────────────────────────────────────────

  sendMessage: async (content: string) => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;

    // Optimistic: show user message immediately
    const userMessage: LearningMessage = {
      id: `temp-${Date.now()}`,
      sessionId: currentSessionId,
      role: 'user',
      content,
      type: 'dialogue',
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message: content,
          messages: get().messages.map((m) => ({
            role: m.role,
            content: m.content,
            type: m.type,
          })),
          knowledgeNodes: get().knowledgeNodes.map((n) => ({
            title: n.title,
            content: n.content,
            category: n.category,
            mastered: n.mastered,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat API returned ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                if (parsed.full) {
                  // Server sends the full sanitized accumulator; replace
                  // rather than append to avoid drift.
                  fullContent = parsed.content;
                } else {
                  fullContent += parsed.content;
                }
                // Strip emoji / decorative symbols so the live-streaming
                // bubble stays thesis-monochrome even if the model emits
                // them despite the system prompt.
                set({ streamingContent: stripEmoji(fullContent) });
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }

      // Re-fetch from DB to get server-side IDs (prevents duplicates)
      set({
        isStreaming: false,
        streamingContent: '',
      });
      await get().fetchMessages(currentSessionId);

      // Refresh knowledge nodes and references
      get().fetchKnowledgeNodes(currentSessionId);
      get().fetchReferences(currentSessionId);

      // Refresh global stats in the background (achievement progress may have changed)
      get().fetchStats();

    } catch (error) {
      console.error('Failed to send message:', error);
      set({ isStreaming: false, streamingContent: '' });
    }
  },

  fetchMessages: async (sessionId: string) => {
    set({ isLoadingMessages: true });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      if (!res.ok) { console.error('fetchMessages failed:', res.status); return; }
      const data = await res.json();
      // Sanitize historical assistant messages too, so old emoji-laden
      // replies (generated before the system-prompt rule) also appear
      // monochrome. User messages are left untouched.
      const cleaned = (data.messages || []).map((m: { role: string; content: string }) =>
        m.role === 'assistant' ? { ...m, content: stripEmoji(m.content || '') } : m
      );
      set({ messages: cleaned });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  // ── Knowledge ────────────────────────────────────────────────────────────

  fetchKnowledgeNodes: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/knowledge`);
      if (!res.ok) { console.error('fetchKnowledgeNodes failed:', res.status); return; }
      const data = await res.json();
      set({ knowledgeNodes: data.nodes || [] });
    } catch (error) {
      console.error('Failed to fetch knowledge nodes:', error);
    }
  },

  fetchReferences: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/references`);
      if (!res.ok) { console.error('fetchReferences failed:', res.status); return; }
      const data = await res.json();
      set({ references: data.references || [] });
    } catch (error) {
      console.error('Failed to fetch references:', error);
    }
  },

  toggleKnowledgeMastered: async (nodeId: string) => {
    // Optimistic update
    const prevNodes = get().knowledgeNodes;
    set((state) => ({
      knowledgeNodes: state.knowledgeNodes.map((n) =>
        n.id === nodeId ? { ...n, mastered: !n.mastered } : n
      ),
    }));
    try {
      const res = await fetch(`/api/knowledge/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        // Rollback on failure
        set({ knowledgeNodes: prevNodes });
        console.error('toggleKnowledgeMastered failed:', res.status);
      } else {
        // Refresh global stats (mastery counts may have changed)
        get().fetchStats();
      }
    } catch (error) {
      // Rollback on network error
      set({ knowledgeNodes: prevNodes });
      console.error('Failed to update knowledge node:', error);
    }
  },

  // ── Course ────────────────────────────────────────────────────────────────

  setCoursePanelOpen: (open: boolean) => set({ coursePanelOpen: open }),
  setActiveLessonId: (id: string | null) => set({ activeLessonId: id }),

  fetchCourse: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/course`);
      if (!res.ok) { console.error('fetchCourse failed:', res.status); return; }
      const data = await res.json();
      const modules: CourseModule[] = (data.modules || []).map((m: any) => ({
        id: m.id,
        sessionId: m.sessionId,
        title: m.title,
        order: m.order,
        lessons: (m.lessons || []).map((l: any) => ({
          id: l.id,
          moduleId: l.moduleId,
          title: l.title,
          type: l.type,
          duration: l.duration,
          status: l.status,
          content: l.content,
          order: l.order,
        })),
      }));
      set({
        courseModules: modules,
        isCourseGenerated: modules.length > 0,
      });
    } catch (error) {
      console.error('Failed to fetch course:', error);
    }
  },

  generateCourse: async () => {
    const state = get();
    if (!state.currentSessionId || state.isGeneratingCourse) return;
    set({ isGeneratingCourse: true });
    try {
      const res = await fetch('/api/course/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.currentSessionId,
          messages: state.messages.map(m => ({ role: m.role, content: m.content, type: m.type })),
          knowledgeNodes: state.knowledgeNodes.map(n => ({
            title: n.title, content: n.content, category: n.category,
            importance: n.importance, mastered: n.mastered,
          })),
        }),
      });
      if (!res.ok) { console.error('generateCourse failed:', res.status); return; }
      const data = await res.json();
      if (data.modules && data.modules.length > 0) {
        // Normalize the response (which should be persisted DB rows when sessionId was provided)
        const modules: CourseModule[] = data.modules.map((m: any) => ({
          id: m.id,
          sessionId: m.sessionId || state.currentSessionId,
          title: m.title,
          order: m.order,
          lessons: (m.lessons || []).map((l: any) => ({
            id: l.id,
            moduleId: l.moduleId,
            title: l.title,
            type: l.type,
            duration: l.duration,
            status: l.status,
            content: l.content,
            order: l.order,
          })),
        }));
        set({ courseModules: modules, isCourseGenerated: true, coursePanelOpen: true });
      }
    } catch (error) {
      console.error('Failed to generate course:', error);
    } finally {
      set({ isGeneratingCourse: false });
    }
  },

  updateLessonStatus: (moduleId: string, lessonId: string, status: CourseLesson['status']) => {
    const { currentSessionId, courseModules } = get();
    if (!currentSessionId) return;

    // Find the lesson to persist its new status
    const targetModule = courseModules.find(m => m.id === moduleId);
    const targetLesson = targetModule?.lessons.find(l => l.id === lessonId);
    if (!targetLesson) return;

    // Optimistic local update (auto-unlock next lesson if completed)
    set((state) => ({
      courseModules: state.courseModules.map(m => {
        if (m.id !== moduleId) return m;
        const updatedLessons = m.lessons.map(l => {
          if (l.id !== lessonId) return l;
          return { ...l, status };
        });
        if (status === 'completed') {
          const completedIdx = updatedLessons.findIndex(l => l.id === lessonId);
          if (completedIdx >= 0 && completedIdx + 1 < updatedLessons.length) {
            const nextLesson = updatedLessons[completedIdx + 1];
            if (nextLesson.status === 'locked') {
              updatedLessons[completedIdx + 1] = { ...nextLesson, status: 'available' };
              // Persist the auto-unlock too
              fetch(`/api/sessions/${currentSessionId}/course`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lessonId: nextLesson.id, status: 'available' }),
              }).catch(err => console.error('Auto-unlock persist failed:', err));
            }
          }
        }
        return { ...m, lessons: updatedLessons };
      }),
    }));

    // Persist the user-triggered status change
    fetch(`/api/sessions/${currentSessionId}/course`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId, status }),
    }).catch(err => console.error('Lesson status persist failed:', err));

    // Stats may need refresh (for "depth thinker" achievement)
    get().fetchStats();
  },

  // ── Notes ─────────────────────────────────────────────────────────────────

  fetchNotes: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/notes`);
      if (!res.ok) { console.error('fetchNotes failed:', res.status); return; }
      const data = await res.json();
      const content = data.note?.content || '';
      set({ notesContent: content, notesSaveStatus: 'idle' });
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    }
  },

  saveNotes: async (sessionId: string, content: string) => {
    set({ isSavingNotes: true, notesSaveStatus: 'saving' });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        set({ notesSaveStatus: 'error' });
        console.error('saveNotes failed:', res.status);
        return;
      }
      set({ notesSaveStatus: 'saved' });
      // Clear "saved" indicator after a short delay
      setTimeout(() => {
        if (get().notesSaveStatus === 'saved') {
          set({ notesSaveStatus: 'idle' });
        }
      }, 1500);
    } catch (error) {
      set({ notesSaveStatus: 'error' });
      console.error('Failed to save notes:', error);
    } finally {
      set({ isSavingNotes: false });
    }
  },

  setNotesContent: (content: string) => {
    const { currentSessionId } = get();
    set({ notesContent: content });

    if (!currentSessionId) return;

    // Debounced auto-save: clear any pending timer, set a new one
    if (notesSaveTimer) {
      clearTimeout(notesSaveTimer);
    }
    set({ notesSaveStatus: 'saving' });
    notesSaveTimer = setTimeout(() => {
      get().saveNotes(currentSessionId, content);
    }, NOTES_SAVE_DELAY_MS);
  },

  setNotesPanelOpen: (open: boolean) => set({ notesPanelOpen: open }),

  // ── Stats ─────────────────────────────────────────────────────────────────

  fetchStats: async () => {
    set({ isLoadingStats: true });
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) { console.error('fetchStats failed:', res.status); return; }
      const data = await res.json();
      const newAchievements = data.achievements || [];
      set({
        stats: data.totals,
        weeklyActivity: data.weeklyActivity || [],
        achievements: newAchievements,
      });

      // Detect newly-unlocked achievements and fire celebratory toasts.
      // We only consider it a "new unlock" if the achievement transitioned
      // from locked → unlocked since the last fetchStats.
      const newlyUnlocked = newAchievements.filter(
        (a: Achievement) => a.unlocked && !knownUnlocked.has(a.id)
      );
      if (newlyUnlocked.length > 0) {
        // Update the known set BEFORE firing toasts so a re-render can't double-fire
        const next = new Set(knownUnlocked);
        for (const a of newlyUnlocked) next.add(a.id);
        knownUnlocked = next;
        saveUnlockedAchievements(next);

        // Fire celebratory toasts. `toast()` is a plain dispatcher from the
        // client-only use-toast hook; the <Toaster /> component mounted in the
        // root layout subscribes and renders them. Safe to call from the store
        // because it only mutates in-memory state + notifies mounted listeners.
        try {
          const { toast } = await import('@/hooks/use-toast');
          for (const a of newlyUnlocked) {
            toast({
              title: `成就解锁：${a.title}`,
              description: a.description,
              duration: 6000,
              className:
                'border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
            });
          }
        } catch (e) {
          console.warn('Achievement toast skipped (hook unavailable):', e);
        }
      } else {
        // Make sure already-unlocked achievements are recorded (first load)
        const next = new Set(knownUnlocked);
        let changed = false;
        for (const a of newAchievements) {
          if (a.unlocked && !next.has(a.id)) { next.add(a.id); changed = true; }
        }
        if (changed) { knownUnlocked = next; saveUnlockedAchievements(next); }
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      set({ isLoadingStats: false });
    }
  },

  // ── UI ────────────────────────────────────────────────────────────────────

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  setKnowledgePanelOpen: (open: boolean) => set({ knowledgePanelOpen: open }),
  setDisplayMode: (mode: 'side' | 'half' | 'full') => set({ displayMode: mode, sidebarOpen: mode !== 'full' }),
  setSettingsPanelOpen: (open: boolean) => set({ settingsPanelOpen: open }),
  setCreateNewPanelOpen: (open: boolean) => set({ createNewPanelOpen: open }),
  setActiveFeatureView: (view: string | null) => {
    set({ activeFeatureView: view, createNewPanelOpen: false });
    // Pre-fetch stats when entering stats or achievements view
    if (view === 'stats' || view === 'achievements') {
      get().fetchStats();
    }
  },

  // ── Feature Actions ─────────────────────────────────────────────────────

  // ── Tasks (persisted) ────────────────────────────────────────────────────

  fetchTasks: async (sessionId: string) => {
    set({ isLoadingTasks: true });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/tasks`);
      if (!res.ok) { console.error('fetchTasks failed:', res.status); return; }
      const data = await res.json();
      set({ tasks: (data.tasks || []).map((t: { id: string; title: string; done: boolean; priority: number; createdAt: string }) => ({
        id: t.id,
        title: t.title,
        done: t.done,
        priority: t.priority,
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date(t.createdAt as unknown as string).toISOString(),
      })) });
    } catch (e) {
      console.error('fetchTasks error:', e);
    } finally {
      set({ isLoadingTasks: false });
    }
  },

  addTask: async (title: string, priority: number = 3) => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    const t = title.trim();
    if (!t) return;
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, priority }),
      });
      if (!res.ok) { console.error('addTask failed:', res.status); return; }
      const { task } = await res.json();
      set((s) => ({
        tasks: [...s.tasks, {
          id: task.id,
          title: task.title,
          done: task.done,
          priority: task.priority,
          createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date(task.createdAt).toISOString(),
        }],
      }));
    } catch (e) {
      console.error('addTask error:', e);
    }
  },

  toggleTask: async (id: string) => {
    // Optimistic update
    const prev = get().tasks;
    const target = prev.find(t => t.id === id);
    if (!target) return;
    set({ tasks: prev.map(t => t.id === id ? { ...t, done: !t.done } : t) });
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !target.done }),
      });
      if (!res.ok) {
        // Rollback on failure
        set({ tasks: prev });
        console.error('toggleTask failed:', res.status);
      }
    } catch (e) {
      set({ tasks: prev });
      console.error('toggleTask error:', e);
    }
  },

  deleteTask: async (id: string) => {
    const prev = get().tasks;
    set({ tasks: prev.filter(t => t.id !== id) });
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    } catch (e) {
      set({ tasks: prev });
      console.error('deleteTask error:', e);
    }
  },

  // ── Cards (persisted) ────────────────────────────────────────────────────

  fetchCards: async (sessionId: string) => {
    set({ isLoadingCards: true });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cards`);
      if (!res.ok) { console.error('fetchCards failed:', res.status); return; }
      const data = await res.json();
      set({ cards: (data.cards || []).map((c: { id: string; front: string; back: string; category: string; mastered: boolean; createdAt: string }) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        category: c.category,
        mastered: c.mastered,
        createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date(c.createdAt as unknown as string).toISOString(),
      })) });
    } catch (e) {
      console.error('fetchCards error:', e);
    } finally {
      set({ isLoadingCards: false });
    }
  },

  addCard: async (front: string, back: string, category: string = '概念') => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) return;
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: f, back: b, category }),
      });
      if (!res.ok) { console.error('addCard failed:', res.status); return; }
      const { card } = await res.json();
      set((s) => ({
        cards: [...s.cards, {
          id: card.id,
          front: card.front,
          back: card.back,
          category: card.category,
          mastered: card.mastered,
          createdAt: typeof card.createdAt === 'string' ? card.createdAt : new Date(card.createdAt).toISOString(),
        }],
      }));
    } catch (e) {
      console.error('addCard error:', e);
    }
  },

  toggleCardMastered: async (id: string) => {
    const prev = get().cards;
    const target = prev.find(c => c.id === id);
    if (!target) return;
    set({ cards: prev.map(c => c.id === id ? { ...c, mastered: !c.mastered } : c) });
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mastered: !target.mastered }),
      });
      if (!res.ok) {
        set({ cards: prev });
        console.error('toggleCardMastered failed:', res.status);
      }
    } catch (e) {
      set({ cards: prev });
      console.error('toggleCardMastered error:', e);
    }
  },

  deleteCard: async (id: string) => {
    const prev = get().cards;
    set({ cards: prev.filter(c => c.id !== id) });
    try {
      await fetch(`/api/cards/${id}`, { method: 'DELETE' });
    } catch (e) {
      set({ cards: prev });
      console.error('deleteCard error:', e);
    }
  },

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
