import { create } from 'zustand';

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
  achievements: Array<{ id: string; title: string; description: string; icon: string; unlocked: boolean; unlockedAt: string | null; progress: number; maxProgress: number }>;

  // Notes state
  notesContent: string;
  notesPanelOpen: boolean;

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
  updateLessonStatus: (moduleId: string, lessonId: string, status: CourseLesson['status']) => void;

  // Actions - UI
  setSidebarOpen: (open: boolean) => void;
  setKnowledgePanelOpen: (open: boolean) => void;
  setDisplayMode: (mode: 'side' | 'half' | 'full') => void;
  setSettingsPanelOpen: (open: boolean) => void;
  setCreateNewPanelOpen: (open: boolean) => void;
  setActiveFeatureView: (view: string | null) => void;
  addTask: (title: string, priority?: number) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addCard: (front: string, back: string, category?: string) => void;
  toggleCardMastered: (id: string) => void;
  setNotesContent: (content: string) => void;
  setNotesPanelOpen: (open: boolean) => void;
  reset: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

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
  notesContent: '',
  notesPanelOpen: false,
  achievements: [
    { id: 'ach-1', title: '初次对话', description: '发送第一条学习消息', icon: 'message', unlocked: false, unlockedAt: null, progress: 0, maxProgress: 1 },
    { id: 'ach-2', title: '知识探索者', description: '学习 5 个不同知识点', icon: 'compass', unlocked: false, unlockedAt: null, progress: 0, maxProgress: 5 },
    { id: 'ach-3', title: '持续学习者', description: '连续 3 天学习', icon: 'flame', unlocked: false, unlockedAt: null, progress: 0, maxProgress: 3 },
    { id: 'ach-4', title: '知识达人', description: '掌握 10 个知识点', icon: 'crown', unlocked: false, unlockedAt: null, progress: 0, maxProgress: 10 },
    { id: 'ach-5', title: '深度思考者', description: '单次对话超过 20 轮', icon: 'brain', unlocked: false, unlockedAt: null, progress: 0, maxProgress: 20 },
    { id: 'ach-6', title: '多面手', description: '创建 5 个学习主题', icon: 'layers', unlocked: false, unlockedAt: null, progress: 0, maxProgress: 5 },
  ],
};

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
    set({ currentSessionId: id, messages: [], knowledgeNodes: [], references: [] });
    await Promise.all([
      get().fetchMessages(id),
      get().fetchKnowledgeNodes(id),
      get().fetchReferences(id),
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
        ...(isCurrent ? { messages: [], knowledgeNodes: [], references: [] } : {}),
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
                fullContent += parsed.content;
                set({ streamingContent: fullContent });
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
      set({ messages: data.messages || [] });
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

  generateCourse: async () => {
    const state = get();
    if (!state.currentSessionId || state.isGeneratingCourse) return;
    set({ isGeneratingCourse: true });
    try {
      const res = await fetch('/api/course/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        set({ courseModules: data.modules, isCourseGenerated: true, coursePanelOpen: true });
      }
    } catch (error) {
      console.error('Failed to generate course:', error);
    } finally {
      set({ isGeneratingCourse: false });
    }
  },

  updateLessonStatus: (moduleId: string, lessonId: string, status: CourseLesson['status']) => {
    set((state) => ({
      courseModules: state.courseModules.map(m => {
        if (m.id !== moduleId) return m;
        const updatedLessons = m.lessons.map(l => {
          if (l.id !== lessonId) return l;
          return { ...l, status };
        });
        // Auto-unlock next lesson if current is completed
        if (status === 'completed') {
          const completedIdx = updatedLessons.findIndex(l => l.id === lessonId);
          if (completedIdx >= 0 && completedIdx + 1 < updatedLessons.length) {
            const nextLesson = updatedLessons[completedIdx + 1];
            if (nextLesson.status === 'locked') {
              updatedLessons[completedIdx + 1] = { ...nextLesson, status: 'available' };
            }
          }
        }
        return { ...m, lessons: updatedLessons };
      }),
    }));
  },

  // ── UI ────────────────────────────────────────────────────────────────────

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  setKnowledgePanelOpen: (open: boolean) => set({ knowledgePanelOpen: open }),
  setDisplayMode: (mode: 'side' | 'half' | 'full') => set({ displayMode: mode, sidebarOpen: mode !== 'full' }),
  setSettingsPanelOpen: (open: boolean) => set({ settingsPanelOpen: open }),
  setCreateNewPanelOpen: (open: boolean) => set({ createNewPanelOpen: open }),
  setActiveFeatureView: (view: string | null) => set({ activeFeatureView: view, createNewPanelOpen: false }),

  // ── Feature Actions ─────────────────────────────────────────────────────

  addTask: (title: string, priority: number = 3) => set((s) => ({
    tasks: [...s.tasks, { id: `task-${Date.now()}`, title, done: false, priority, createdAt: new Date().toISOString() }],
  })),
  toggleTask: (id: string) => set((s) => ({
    tasks: s.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t),
  })),
  deleteTask: (id: string) => set((s) => ({
    tasks: s.tasks.filter(t => t.id !== id),
  })),
  addCard: (front: string, back: string, category: string = '概念') => set((s) => ({
    cards: [...s.cards, { id: `card-${Date.now()}`, front, back, category, mastered: false, createdAt: new Date().toISOString() }],
  })),
  toggleCardMastered: (id: string) => set((s) => ({
    cards: s.cards.map(c => c.id === id ? { ...c, mastered: !c.mastered } : c),
  })),
  setNotesContent: (content: string) => set({ notesContent: content }),
  setNotesPanelOpen: (open: boolean) => set({ notesPanelOpen: open }),

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
