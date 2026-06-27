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
  // Card / SM-2 review metrics
  totalCards: number;
  masteredCards: number;
  dueCards: number;
  reviewedCards: number;
  avgEase: number;
  // Task metrics
  totalTasks: number;
  doneTasks: number;
}

export interface LearningMaterial {
  id: string;
  sessionId: string;
  filename: string;
  fileType: string;
  size: number;
  title: string | null;
  charCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  // RAG pipeline metadata (v1.1+)
  parser?: string | null;
  pageCount?: number | null;
  language?: string | null;
  chunkCount?: number;
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
  // Reasoning trace streamed from the model while thinking is enabled. Cleared
  // at the start of each turn. Drives the "思考中" animation phase: while
  // streamingThinking is non-empty AND streamingContent is empty, the composer
  // shows the thinking animation; once content starts arriving the animation
  // transitions to the answer phase.
  streamingThinking: string;
  // Explicit phase signal from the server ('thinking' | 'answering' | null).
  // More reliable than inferring phase from content emptiness — the server
  // sends `phase:'thinking'` the moment the first reasoning token arrives,
  // even before any reasoning text has been forwarded.
  streamingPhase: 'thinking' | 'answering' | null;
  // Phase 2: Multi-step reasoning steps (deep/structured modes). Each step
  // is emitted as an SSE { step } event before the final answer streams.
  // The frontend Reasoning panel shows "Step 1/N: Analyzing..." progress.
  streamingSteps: Array<{ index: number; total: number; label: string; result: string }>;
  // Last stream error message (null when no error). Set when the SSE stream
  // emits an error event or the fetch fails mid-stream. The UI surfaces a
  // toast when this transitions from null → string, then clears it after a
  // timeout. This is the ONLY authoritative error channel — the UI should
  // NOT infer errors from "isStreaming went false with no content" because
  // that also happens on legitimate empty responses.
  lastStreamError: string | null;

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
  settingsViewOpen: boolean;
  createNewPanelOpen: boolean;
  // Focus mode — entered via ⌘E. Collapses sidebar + course panel + any
  // active feature view, and visually centers + enlarges the composer so the
  // learner can compose long questions without distraction. The previous
  // sidebar/coursePanelOpen state is remembered so exiting focus mode
  // restores it.
  focusMode: boolean;
  // Persisted sidebar width (px) for the resizable panel. Default 260.
  sidebarWidth: number;
  // Teaching mode — the "programming mode" analogue. The composer exposes this
  // as a selector (引导 / 讲解 / 练习 / 复习); the chat route reads it and tweaks
  // the system prompt so the same model behaves like four different teachers.
  teachingMode: 'guide' | 'explain' | 'practice' | 'review';
  // Thinking mode — controls how deeply the model reasons before answering.
  //   off         → thinking disabled, fast direct answer
  //   standard    → model's built-in deep reasoning (thinking.enabled)
  //   deep        → strong reasoning context overlay: multi-angle / counter-example / edge-case
  //   structured  → advanced reasoning structure: chain → self-critique → multi-path
  // The composer exposes this as a 4-way selector next to the send button;
  // the chat route reads it and toggles `thinking: {type:'enabled'|'disabled'}`
  // plus an additive reasoning-style prompt overlay.
  thinkingMode: 'off' | 'standard' | 'deep' | 'structured';
  // Selected chat model — exposed in the composer's right-side ModelCard.
  // The chat route reads this to choose which ZAI model to call.
  selectedModel: 'GLM-4.6' | 'GLM-4.5' | 'GLM-4-Air';
  // Cumulative token usage for the active session (input + output, all turns).
  // Used by the ModelCard's "模型用量" meter. Reset when switching sessions.
  modelUsageTokens: number;
  activeFeatureView: string | null;
  // Direction of the last activeFeatureView transition:
  //   +1 = forward (welcome → feature, or feature → different feature)
  //   -1 = backward (feature → welcome)
  // Computed atomically inside setActiveFeatureView so page.tsx's AnimatePresence
  // can read it without setState-in-effect cascades. See anim-refine-003 in
  // worklog.md for the full rationale.
  activeFeatureViewDir: 1 | -1;

  // Feature state
  tasks: Array<{ id: string; title: string; done: boolean; priority: number; order: number; createdAt: string }>;
  cards: Array<{
    id: string;
    front: string;
    back: string;
    category: string;
    mastered: boolean;
    ease: number;
    interval: number;
    repetition: number;
    dueAt: string | null;
    lastReviewedAt: string | null;
    createdAt: string;
  }>;
  isLoadingTasks: boolean;
  isLoadingCards: boolean;
  achievements: Achievement[];

  // Card review (SM-2) session state
  reviewQueue: Array<{
    id: string;
    front: string;
    back: string;
    category: string;
    ease: number;
    interval: number;
    repetition: number;
    dueAt: string | null;
    lastReviewedAt: string | null;
  }>;
  reviewIndex: number;
  reviewFlipped: boolean;
  reviewStats: { forgot: number; hard: number; good: number; easy: number };
  isReviewing: boolean;
  isFetchingReview: boolean;
  isSubmittingReview: boolean;
  reviewLastQuality: number | null;
  // Cards re-queued once this session due to a lapse (quality=0). Tracked so a
  // card the user truly can't recall doesn't loop forever — each card gets at
  // most ONE second chance per review session (standard Anki "leech" guard).
  lapsedCardIds: Set<string>;

  // Stats state
  stats: LearningStats | null;
  weeklyActivity: WeeklyActivityItem[];
  // 30-day user-message trend (for recharts line chart)
  dailyTrend: Array<{ label: string; count: number }>;
  // Knowledge category breakdown (for recharts radar chart)
  categoryDistribution: Array<{ category: string; count: number }>;
  // 14-day cumulative mastery (for recharts stacked area)
  masteryTrend: Array<{ label: string; mastered: number; unmastered: number }>;
  isLoadingStats: boolean;

  // Notes state
  notesContent: string;
  notesPanelOpen: boolean;
  isSavingNotes: boolean;
  notesSaveStatus: 'idle' | 'saving' | 'saved' | 'error';

  // Materials (file import / knowledge base) state
  materials: LearningMaterial[];
  isLoadingMaterials: boolean;
  isUploadingMaterials: boolean;
  /** ID of the material currently being re-parsed (high-precision), or null. */
  reparsingMaterialId: string | null;

  // Actions - Sessions
  fetchSessions: () => Promise<void>;
  createSession: (title: string, topic?: string) => Promise<LearningSession | null>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;

  // Actions - Messages
  sendMessage: (content: string) => Promise<void>;
  regenerateLastMessage: () => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;

  // Actions - Knowledge
  fetchKnowledgeNodes: (sessionId: string) => Promise<void>;
  fetchReferences: (sessionId: string) => Promise<void>;
  toggleKnowledgeMastered: (nodeId: string) => Promise<void>;
  setKnowledgeImportance: (nodeId: string, importance: number) => Promise<void>;

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

  // Actions - Materials (file import / knowledge base)
  fetchMaterials: (sessionId: string) => Promise<void>;
  uploadMaterials: (sessionId: string, files: File[], opts?: { precision?: 'fast' | 'medium' | 'high'; enrich?: boolean }) => Promise<void>;
  reparseMaterial: (materialId: string, file: File, opts?: { precision?: 'fast' | 'medium' | 'high'; enrich?: boolean }) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;
  updateMaterialTitle: (id: string, title: string) => Promise<void>;

  // Actions - UI
  setSidebarOpen: (open: boolean) => void;
  setKnowledgePanelOpen: (open: boolean) => void;
  setDisplayMode: (mode: 'side' | 'half' | 'full') => void;
  toggleFocusMode: () => void;
  setFocusMode: (on: boolean) => void;
  setSidebarWidth: (px: number) => void;
  setTeachingMode: (mode: 'guide' | 'explain' | 'practice' | 'review') => void;
  setThinkingMode: (mode: 'off' | 'standard' | 'deep' | 'structured') => void;
  setSelectedModel: (model: 'GLM-4.6' | 'GLM-4.5' | 'GLM-4-Air') => void;
  setModelUsageTokens: (tokens: number) => void;
  setSettingsPanelOpen: (open: boolean) => void;
  setSettingsViewOpen: (open: boolean) => void;
  setCreateNewPanelOpen: (open: boolean) => void;
  setActiveFeatureView: (view: string | null) => void;
  fetchTasks: (sessionId: string) => Promise<void>;
  addTask: (title: string, priority?: number) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setTaskPriority: (id: string, priority: number) => Promise<void>;
  reorderTasks: (orderedIds: string[]) => Promise<void>;
  fetchCards: (sessionId: string) => Promise<void>;
  addCard: (front: string, back: string, category?: string) => Promise<void>;
  toggleCardMastered: (id: string) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  // SM-2 review
  startReview: () => Promise<void>;
  flipReviewCard: () => void;
  submitReview: (quality: 0 | 2 | 4 | 5) => Promise<void>;
  exitReview: () => void;
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
  totalCards: 0,
  masteredCards: 0,
  dueCards: 0,
  reviewedCards: 0,
  avgEase: 2.5,
  totalTasks: 0,
  doneTasks: 0,
};

const initialState = {
  sessions: [] as LearningSession[],
  currentSessionId: null as string | null,
  isLoading: false,
  messages: [] as LearningMessage[],
  isLoadingMessages: false,
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',
  streamingPhase: null,
  streamingSteps: [] as Array<{ index: number; total: number; label: string; result: string }>,
  lastStreamError: null,
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
  focusMode: false,
  sidebarWidth: 260,
  teachingMode: 'guide' as const,
  thinkingMode: 'standard' as 'off' | 'standard' | 'deep' | 'structured',
  selectedModel: 'GLM-4.6' as 'GLM-4.6' | 'GLM-4.5' | 'GLM-4-Air',
  modelUsageTokens: 0,
  settingsPanelOpen: false,
  settingsViewOpen: false,
  createNewPanelOpen: false,
  activeFeatureView: null as string | null,
  activeFeatureViewDir: 1 as 1 | -1,
  tasks: [] as Array<{ id: string; title: string; done: boolean; priority: number; order: number; createdAt: string }>,
  cards: [] as Array<{
    id: string;
    front: string;
    back: string;
    category: string;
    mastered: boolean;
    ease: number;
    interval: number;
    repetition: number;
    dueAt: string | null;
    lastReviewedAt: string | null;
    createdAt: string;
  }>,
  isLoadingTasks: false,
  isLoadingCards: false,
  reviewQueue: [] as Array<{
    id: string;
    front: string;
    back: string;
    category: string;
    ease: number;
    interval: number;
    repetition: number;
    dueAt: string | null;
    lastReviewedAt: string | null;
  }>,
  reviewIndex: 0,
  reviewFlipped: false,
  reviewStats: { forgot: 0, hard: 0, good: 0, easy: 0 },
  isReviewing: false,
  isFetchingReview: false,
  isSubmittingReview: false,
  reviewLastQuality: null as number | null,
  lapsedCardIds: new Set<string>() as Set<string>,
  notesContent: '',
  notesPanelOpen: false,
  isSavingNotes: false,
  notesSaveStatus: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
  stats: initialStats,
  weeklyActivity: [] as WeeklyActivityItem[],
  dailyTrend: [] as Array<{ label: string; count: number }>,
  categoryDistribution: [] as Array<{ category: string; count: number }>,
  masteryTrend: [] as Array<{ label: string; mastered: number; unmastered: number }>,
  isLoadingStats: false,
  achievements: [] as Achievement[],
  materials: [] as LearningMaterial[],
  isLoadingMaterials: false,
  isUploadingMaterials: false,
  reparsingMaterialId: null,
};

// ─── Notes Save Debounce Tracker ────────────────────────────────────────────
// Module-level timer to debounce notes auto-save across store instances
let notesSaveTimer: ReturnType<typeof setTimeout> | null = null;
const NOTES_SAVE_DELAY_MS = 800;

// ─── Focus Mode Snapshot ────────────────────────────────────────────────────
// Module-level ref holding the pre-focus sidebar/course/featureView state so
// exiting focus mode can restore it. Lives outside the store because the UI
// never reads it directly — it's transient restore data.
let focusSnapshot: {
  sidebarOpen: boolean;
  coursePanelOpen: boolean;
  activeFeatureView: string | null;
} | null = null;

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
      // Reset all floating-panel open states so panels from the previous
      // session don't persist into the new one (course / more-features /
      // settings-panel / settings-view).
      coursePanelOpen: false,
      createNewPanelOpen: false,
      settingsPanelOpen: false,
      settingsViewOpen: false,
      messages: [],
      knowledgeNodes: [],
      references: [],
      courseModules: [],
      isCourseGenerated: false,
      notesContent: '',
      notesSaveStatus: 'idle',
      tasks: [],
      cards: [],
      materials: [],
      // Reset per-session model usage meter — the ModelCard reads this.
      modelUsageTokens: 0,
    });
    await Promise.all([
      get().fetchMessages(id),
      get().fetchKnowledgeNodes(id),
      get().fetchReferences(id),
      get().fetchCourse(id),
      get().fetchNotes(id),
      get().fetchTasks(id),
      get().fetchCards(id),
      get().fetchMaterials(id),
    ]);
  },

  deleteSession: async (id: string) => {
    // Optimistic UI: remove from local state FIRST so the sidebar reacts
    // instantly. The DELETE endpoint is idempotent (P2025 → 200), so a
    // duplicate click or a stale id won't cause a retry storm.
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
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) { console.error('deleteSession failed:', res.status); }
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
      streamingThinking: '',
      streamingPhase: null,
      streamingSteps: [],
      lastStreamError: null,
    }));

    // ── Minimum thinking-phase duration ──
    //
    // GLM-4.6 via the current SDK doesn't surface `reasoning_content` in the
    // stream — the model reasons internally and emits only `content`, often
    // within ~300ms. That makes the "thinking" animation flash too fast for
    // the user to perceive. When thinking is enabled (any mode other than
    // 'off'), we SYNTHESIZE a thinking phase: set streamingPhase='thinking'
    // immediately and hold it for a minimum duration (900ms) OR until real
    // reasoning tokens arrive (whichever is longer). If content arrives
    // before the minimum elapses, we buffer it and flush on phase transition.
    // A sub-second minimum keeps the thinking animation legible (avoids a
    // sub-200ms flash that reads as a glitch).
    const thinkingEnabled = get().thinkingMode !== 'off';
    const MIN_THINK_MS = 900;
    let thinkHoldUntil = 0;
    let bufferedContent = '';
    let phaseHeld = false;
    if (thinkingEnabled) {
      set({ streamingPhase: 'thinking' });
      thinkHoldUntil = Date.now() + MIN_THINK_MS;
      phaseHeld = true;
    }

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
          teachingMode: get().teachingMode,
          thinkingMode: get().thinkingMode,
          selectedModel: get().selectedModel,
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
      let fullThinking = '';

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
              // Phase signal — the server sends this once when reasoning
              // starts and again when content starts. This is the AUTHORITATIVE
              // phase marker (more reliable than inferring from emptiness).
              // But if we're holding a synthesized thinking phase (min duration),
              // we DON'T let 'answering' end it early — we hold until the timer.
              if (parsed.phase === 'thinking' && !phaseHeld) {
                set({ streamingPhase: 'thinking' });
              }
              // Phase 2: Multi-step reasoning step (deep/structured modes).
              // Each { step } event carries an intermediate reasoning result.
              // We append it to streamingSteps so the frontend Reasoning panel
              // can render "Step 1/N: Analyzing..." with live progress.
              if (parsed.step && typeof parsed.step === 'object') {
                const step = parsed.step as { index: number; total: number; label: string; result: string };
                set((state) => ({
                  streamingSteps: [...state.streamingSteps, step],
                  // Ensure we're in the thinking phase while steps are running.
                  streamingPhase: 'thinking',
                }));
              }
              // Reasoning trace (only sent while thinking is enabled). We
              // accumulate it for a future "查看推理" panel; the thinking
              // animation itself is driven by streamingPhase.
              if (typeof parsed.thinking === 'string') {
                if (parsed.full) {
                  fullThinking = parsed.thinking;
                } else {
                  fullThinking += parsed.thinking;
                }
                set({ streamingThinking: stripEmoji(fullThinking) });
              }
              if (parsed.content) {
                if (parsed.full) {
                  fullContent = parsed.content;
                } else {
                  fullContent += parsed.content;
                }
                const sanitized = stripEmoji(fullContent);
                // If we're still in the synthesized thinking-hold window,
                // BUFFER the content instead of showing it — the thinking
                // animation must complete its minimum duration so the user
                // perceives the deliberation. We flush on phase transition.
                if (phaseHeld && Date.now() < thinkHoldUntil) {
                  bufferedContent = sanitized;
                } else {
                  if (phaseHeld) {
                    // Hold window elapsed — transition to answering + flush.
                    phaseHeld = false;
                    set({ streamingPhase: 'answering' });
                  }
                  set({ streamingContent: sanitized });
                }
              }
              // Stream error — the upstream connection broke. Surface as a
              // recoverable error instead of looping forever.
              if (parsed.error) {
                throw new Error(`stream_error: ${parsed.error}`);
              }
            } catch (e) {
              // Re-throw stream errors (thrown by the parsed.error branch).
              if (e instanceof Error && e.message.startsWith('stream_error:')) {
                throw e;
              }
              // Skip malformed JSON chunks
            }
          }
        }
      }

      // If we were holding a synthesized thinking phase and the stream ended
      // before the minimum duration elapsed, wait out the remainder so the
      // thinking animation completes its minimum legible duration, THEN flush
      // any buffered content. This ensures even very-fast model responses
      // (<300ms) still show a perceptible "推理中" phase.
      if (phaseHeld) {
        const remaining = thinkHoldUntil - Date.now();
        if (remaining > 0) {
          await new Promise(r => setTimeout(r, remaining));
        }
        if (bufferedContent) {
          set({ streamingPhase: 'answering', streamingContent: bufferedContent });
          // Brief beat so the user sees the answer appear after the thinking.
          await new Promise(r => setTimeout(r, 150));
        }
        phaseHeld = false;
      }

      // Re-fetch from DB to get server-side IDs (prevents duplicates)
      set({
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        streamingPhase: null,
        streamingSteps: [],
      });
      // Accumulate model usage estimate for this session — every assistant
      // turn adds input + output tokens. We approximate with message length
      // (chars/4 ≈ tokens) since the SSE stream doesn't surface usage. This
      // is what the ModelCard's "模型用量" meter reads.
      const approxAddedTokens = Math.ceil((content.length + fullContent.length + fullThinking.length) / 4);
      set({ modelUsageTokens: get().modelUsageTokens + approxAddedTokens });
      await get().fetchMessages(currentSessionId);

      // Refresh knowledge nodes and references
      get().fetchKnowledgeNodes(currentSessionId);
      get().fetchReferences(currentSessionId);

      // Refresh global stats in the background (achievement progress may have changed)
      get().fetchStats();

    } catch (error) {
      console.error('Failed to send message:', error);
      // Reset all streaming state so the composer becomes editable again.
      // If the error was a stream interruption, the user can re-send.
      const errMsg = error instanceof Error ? error.message : 'unknown_error';
      const friendly = errMsg.includes('stream_interrupted')
        ? '回复被中断，请重新发送'
        : errMsg.includes('Chat API returned')
          ? '服务暂不可用，请稍后重试'
          : '发送失败，请重试';
      set({
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        streamingPhase: null,
        streamingSteps: [],
        lastStreamError: friendly,
      });
    }
  },

  // Regenerate the most recent assistant reply.
  //
  // Strategy: walk back from the end of the thread, find the last user turn,
  // delete that user turn AND every message after it (the assistant reply we
  // want to replace) from both the DB and local state, then re-send the same
  // question through sendMessage(). This yields a clean single-question /
  // single-answer tail — no duplicates, no orphan turns.
  regenerateLastMessage: async () => {
    const { currentSessionId, messages, isStreaming, sendMessage } = get();
    if (!currentSessionId || isStreaming) return;

    // Find the index of the last user message.
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    const lastUserContent = messages[lastUserIdx].content;
    const toDelete = messages.slice(lastUserIdx); // user turn + everything after

    // Optimistically trim local state so the UI drops the old reply at once.
    set({ messages: messages.slice(0, lastUserIdx) });

    // Delete the trailing turns from the DB. We delete in order; if any single
    // delete fails we keep going (the subsequent fetchMessages will reconcile).
    await Promise.all(
      toDelete
        .filter(m => !m.id.startsWith('temp-'))
        .map(m => fetch(`/api/messages/${m.id}`, { method: 'DELETE' }).catch(() => {}))
    );

    // Re-ask the same question — sendMessage adds the user turn back and
    // streams a fresh reply.
    await sendMessage(lastUserContent);
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

  setKnowledgeImportance: async (nodeId: string, importance: number) => {
    // Optimistic update — clamp to 1-5
    const clamped = Math.max(1, Math.min(5, Math.round(importance)));
    const prevNodes = get().knowledgeNodes;
    set((state) => ({
      knowledgeNodes: state.knowledgeNodes.map((n) =>
        n.id === nodeId ? { ...n, importance: clamped } : n
      ),
    }));
    try {
      const res = await fetch(`/api/knowledge/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importance: clamped }),
      });
      if (!res.ok) {
        set({ knowledgeNodes: prevNodes });
        console.error('setKnowledgeImportance failed:', res.status);
      }
    } catch (error) {
      set({ knowledgeNodes: prevNodes });
      console.error('Failed to update knowledge importance:', error);
    }
  },

  // ── Course ────────────────────────────────────────────────────────────────

  setCoursePanelOpen: (open: boolean) =>
    // Opening the course panel closes any active FeatureView (mutex — the two
    // compete for horizontal width). Closing the panel leaves the FeatureView
    // state untouched so the user can return to it via the sidebar.
    set(
      open
        ? { coursePanelOpen: true, activeFeatureView: null }
        : { coursePanelOpen: false }
    ),
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
        dailyTrend: data.dailyTrend || [],
        categoryDistribution: data.categoryDistribution || [],
        masteryTrend: data.masteryTrend || [],
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

  // ── Materials (file import / knowledge base) ───────────────────────────────

  fetchMaterials: async (sessionId: string) => {
    set({ isLoadingMaterials: true });
    try {
      const res = await fetch(`/api/sessions/${sessionId}/materials`);
      if (!res.ok) { console.error('fetchMaterials failed:', res.status); return; }
      const data = await res.json();
      set({ materials: (data.materials || []) as LearningMaterial[] });
    } catch (error) {
      console.error('Failed to fetch materials:', error);
    } finally {
      set({ isLoadingMaterials: false });
    }
  },

  uploadMaterials: async (sessionId: string, files: File[], opts?: { precision?: 'fast' | 'medium' | 'high'; enrich?: boolean }) => {
    if (files.length === 0) return;
    set({ isUploadingMaterials: true });
    try {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      if (opts?.precision) formData.append('precision', opts.precision);
      if (opts?.enrich !== undefined) formData.append('enrich', String(opts.enrich));
      const res = await fetch(`/api/sessions/${sessionId}/materials`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        console.error('uploadMaterials failed:', res.status);
        try {
          const { toast } = await import('@/hooks/use-toast');
          toast({
            title: '文件导入失败',
            description: `服务器返回 ${res.status}`,
            variant: 'destructive',
          });
        } catch {}
        return;
      }
      const data = await res.json();
      // Merge newly created materials into the list. The API may also return
      // error stubs (id: null) for oversized files — filter those out.
      const created = (data.materials || []).filter((m: any) => m && m.id);
      const errored = (data.materials || []).filter((m: any) => m && !m.id);
      if (created.length > 0) {
        set((s) => ({ materials: [...created, ...s.materials] }));
      }
      if (errored.length > 0) {
        try {
          const { toast } = await import('@/hooks/use-toast');
          for (const e of errored) {
            toast({
              title: `${e.filename} 跳过`,
              description: e.error || '不支持的文件',
              variant: 'destructive',
            });
          }
        } catch {}
      }
      // Surface parser warnings (e.g. "PDF 无文本层，可能为扫描件") so the
      // learner knows why a file produced 0 chars / 0 chunks.
      const warnings: string[] = [];
      for (const m of created) {
        const w = (m as any).warnings;
        if (Array.isArray(w) && w.length > 0) {
          warnings.push(`${m.filename}: ${w.join('；')}`);
        }
      }
      if (created.length > 0) {
        try {
          const { toast } = await import('@/hooks/use-toast');
          const totalChunks = created.reduce((sum: number, m: any) => sum + (m.chunkCount || 0), 0);
          toast({
            title: `已导入 ${created.length} 个文件 · 索引 ${totalChunks} 个片段`,
            description: warnings.length > 0
              ? warnings.join('；')
              : 'AI 对话与课程生成将基于这些资料的相关片段进行 RAG 检索',
            duration: 5000,
            className:
              'border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
          });
        } catch {}
      }
    } catch (error) {
      console.error('Failed to upload materials:', error);
    } finally {
      set({ isUploadingMaterials: false });
    }
  },

  deleteMaterial: async (id: string) => {
    // Optimistic removal — if the server delete fails, we refetch to restore.
    set((s) => ({ materials: s.materials.filter((m) => m.id !== id) }));
    try {
      const res = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('deleteMaterial failed:', res.status);
        const { currentSessionId } = get();
        if (currentSessionId) await get().fetchMaterials(currentSessionId);
      }
    } catch (error) {
      console.error('Failed to delete material:', error);
      const { currentSessionId } = get();
      if (currentSessionId) await get().fetchMaterials(currentSessionId);
    }
  },

  reparseMaterial: async (materialId: string, file: File, opts?: { precision?: 'fast' | 'medium' | 'high'; enrich?: boolean }) => {
    set({ reparsingMaterialId: materialId });
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('precision', opts?.precision ?? 'high');
      if (opts?.enrich !== undefined) formData.append('enrich', String(opts.enrich));
      const res = await fetch(`/api/materials/${materialId}/reparse`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        console.error('reparseMaterial failed:', res.status);
        try {
          const { toast } = await import('@/hooks/use-toast');
          toast({
            title: '重新解析失败',
            description: `服务器返回 ${res.status}`,
            variant: 'destructive',
          });
        } catch {}
        return;
      }
      const data = await res.json();
      const updated = data.material;
      if (updated) {
        // Replace the material in the list with the updated row.
        set((s) => ({
          materials: s.materials.map((m) => (m.id === materialId ? { ...m, ...updated } : m)),
        }));
        const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
        try {
          const { toast } = await import('@/hooks/use-toast');
          toast({
            title: `重新解析完成 · ${updated.parser ?? '未知'} · ${updated.chunkCount ?? 0} 片段`,
            description: warnings.length > 0
              ? warnings.join('；')
              : (data.semanticEnriched ? '已生成语义关键词索引' : '未启用语义增强'),
            duration: 5000,
            className:
              'border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100',
          });
        } catch {}
      }
    } catch (error) {
      console.error('Failed to reparse material:', error);
    } finally {
      set({ reparsingMaterialId: null });
    }
  },

  updateMaterialTitle: async (id: string, title: string) => {
    // Optimistic update
    set((s) => ({
      materials: s.materials.map((m) => (m.id === id ? { ...m, title } : m)),
    }));
    try {
      const res = await fetch(`/api/materials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        console.error('updateMaterialTitle failed:', res.status);
        const { currentSessionId } = get();
        if (currentSessionId) await get().fetchMaterials(currentSessionId);
      }
    } catch (error) {
      console.error('Failed to update material title:', error);
      const { currentSessionId } = get();
      if (currentSessionId) await get().fetchMaterials(currentSessionId);
    }
  },

  // ── UI ────────────────────────────────────────────────────────────────────

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  setKnowledgePanelOpen: (open: boolean) => set({ knowledgePanelOpen: open }),
  setDisplayMode: (mode: 'side' | 'half' | 'full') => set({ displayMode: mode, sidebarOpen: mode !== 'full' }),

  // ── Focus mode ────────────────────────────────────────────────────────────
  //
  // Toggling focus ON remembers the current sidebarOpen + coursePanelOpen +
  // activeFeatureView so they can be restored on exit. While focus mode is
  // active, the layout (page.tsx) hides the sidebar and the course panel,
  // and the composer (chat-composer) enlarges itself + centers.
  //
  // We stash the pre-focus state in a module-scoped ref (not in the store
  // itself — it's transient restore data the UI never reads directly).
  setFocusMode: (on: boolean) => {
    if (on) {
      // Enter: snapshot current state, then collapse everything.
      const st = get();
      focusSnapshot = {
        sidebarOpen: st.sidebarOpen,
        coursePanelOpen: st.coursePanelOpen,
        activeFeatureView: st.activeFeatureView,
      };
      set({
        focusMode: true,
        sidebarOpen: false,
        coursePanelOpen: false,
        activeFeatureView: null,
        createNewPanelOpen: false,
        settingsPanelOpen: false,
      });
    } else {
      // Exit: restore the snapshot (fallback to sensible defaults if null).
      const snap = focusSnapshot ?? { sidebarOpen: true, coursePanelOpen: false, activeFeatureView: null };
      set({
        focusMode: false,
        sidebarOpen: snap.sidebarOpen,
        coursePanelOpen: snap.coursePanelOpen,
        activeFeatureView: snap.activeFeatureView,
      });
      focusSnapshot = null;
    }
  },
  toggleFocusMode: () => get().setFocusMode(!get().focusMode),
  setSidebarWidth: (px: number) =>
    set({ sidebarWidth: Math.max(200, Math.min(480, Math.round(px))) }),
  setTeachingMode: (mode: 'guide' | 'explain' | 'practice' | 'review') => set({ teachingMode: mode }),
  setThinkingMode: (mode: 'off' | 'standard' | 'deep' | 'structured') => set({ thinkingMode: mode }),
  setSelectedModel: (model: 'GLM-4.6' | 'GLM-4.5' | 'GLM-4-Air') => set({ selectedModel: model }),
  setModelUsageTokens: (tokens: number) => set({ modelUsageTokens: Math.max(0, Math.floor(tokens)) }),
  setSettingsPanelOpen: (open: boolean) => set({ settingsPanelOpen: open }),
  setSettingsViewOpen: (open: boolean) => set({ settingsViewOpen: open }),
  setCreateNewPanelOpen: (open: boolean) => set({ createNewPanelOpen: open }),
  setActiveFeatureView: (view: string | null) => {
    // Compute transition direction atomically with the view change so
    // page.tsx's AnimatePresence can read it without setState-in-effect.
    // Backward = we had a feature and now we don't (going back to welcome).
    // Forward = entering a feature from welcome, or switching features.
    const prev = get().activeFeatureView;
    const dir: 1 | -1 = prev !== null && view === null ? -1 : 1;
    // Opening a FeatureView now also closes the course panel — the two are
    // mutually exclusive to avoid them competing for horizontal width in the
    // main area (course-panel is 420px, FeatureView content is centered
    // max-w-600px). Closing createNewPanelOpen is the existing behavior.
    set({
      activeFeatureView: view,
      activeFeatureViewDir: dir,
      createNewPanelOpen: false,
      coursePanelOpen: view !== null ? false : get().coursePanelOpen,
    });
    // Pre-fetch stats when entering the progress (stats+achievements) view
    if (view === 'progress') {
      get().fetchStats();
    }
    // Pre-fetch materials when entering the materials view
    if (view === 'materials') {
      const sid = get().currentSessionId;
      if (sid) get().fetchMaterials(sid);
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
      set({ tasks: (data.tasks || []).map((t: { id: string; title: string; done: boolean; priority: number; order?: number; createdAt: string }) => ({
        id: t.id,
        title: t.title,
        done: t.done,
        priority: t.priority,
        order: typeof t.order === 'number' ? t.order : 0,
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
          order: typeof task.order === 'number' ? task.order : s.tasks.length,
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

  setTaskPriority: async (id: string, priority: number) => {
    const p = Math.min(5, Math.max(1, Math.floor(priority)));
    const prev = get().tasks;
    set({ tasks: prev.map(t => t.id === id ? { ...t, priority: p } : t) });
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: p }),
      });
      if (!res.ok) {
        set({ tasks: prev });
        console.error('setTaskPriority failed:', res.status);
      }
    } catch (e) {
      set({ tasks: prev });
      console.error('setTaskPriority error:', e);
    }
  },

  reorderTasks: async (orderedIds: string[]) => {
    // Optimistic: assign new sequential `order` values to all tasks
    const prev = get().tasks;
    const byId = new Map(prev.map(t => [t.id, t]));
    const next = orderedIds
      .map((id, idx) => {
        const t = byId.get(id);
        return t ? { ...t, order: idx } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // Append any tasks not in orderedIds at the end (defensive)
    for (const t of prev) {
      if (!orderedIds.includes(t.id)) next.push({ ...t, order: next.length });
    }
    set({ tasks: next });
    // Persist: send all order updates (PATCH each, batched fire-and-forget)
    try {
      await Promise.all(orderedIds.map((id, idx) =>
        fetch(`/api/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: idx }),
        }).catch(e => console.error('reorderTasks persist error:', e))
      ));
    } catch (e) {
      console.error('reorderTasks error:', e);
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
      set({ cards: (data.cards || []).map((c: {
        id: string; front: string; back: string; category: string; mastered: boolean;
        ease?: number; interval?: number; repetition?: number;
        dueAt?: string | null; lastReviewedAt?: string | null;
        createdAt: string;
      }) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        category: c.category,
        mastered: c.mastered,
        ease: typeof c.ease === 'number' ? c.ease : 2.5,
        interval: typeof c.interval === 'number' ? c.interval : 0,
        repetition: typeof c.repetition === 'number' ? c.repetition : 0,
        dueAt: c.dueAt ? (typeof c.dueAt === 'string' ? c.dueAt : new Date(c.dueAt as unknown as string).toISOString()) : null,
        lastReviewedAt: c.lastReviewedAt ? (typeof c.lastReviewedAt === 'string' ? c.lastReviewedAt : new Date(c.lastReviewedAt as unknown as string).toISOString()) : null,
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
          ease: typeof card.ease === 'number' ? card.ease : 2.5,
          interval: typeof card.interval === 'number' ? card.interval : 0,
          repetition: typeof card.repetition === 'number' ? card.repetition : 0,
          dueAt: card.dueAt ? (typeof card.dueAt === 'string' ? card.dueAt : new Date(card.dueAt).toISOString()) : null,
          lastReviewedAt: card.lastReviewedAt ? (typeof card.lastReviewedAt === 'string' ? card.lastReviewedAt : new Date(card.lastReviewedAt).toISOString()) : null,
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

  // ── SM-2 Card Review ────────────────────────────────────────────────────

  startReview: async () => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    set({
      isFetchingReview: true,
      isReviewing: true,
      reviewIndex: 0,
      reviewFlipped: false,
      reviewStats: { forgot: 0, hard: 0, good: 0, easy: 0 },
      reviewLastQuality: null,
      reviewQueue: [],
      lapsedCardIds: new Set(),
    });
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}/cards/review?limit=50`);
      if (!res.ok) { console.error('startReview failed:', res.status); return; }
      const data = await res.json();
      const queue: Array<{
        id: string; front: string; back: string; category: string;
        ease: number; interval: number; repetition: number;
        dueAt: string | null; lastReviewedAt: string | null;
      }> = (data.queue || []).map((c: {
        id: string; front: string; back: string; category: string;
        ease?: number; interval?: number; repetition?: number;
        dueAt?: string | null; lastReviewedAt?: string | null;
      }) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        category: c.category,
        ease: typeof c.ease === 'number' ? c.ease : 2.5,
        interval: typeof c.interval === 'number' ? c.interval : 0,
        repetition: typeof c.repetition === 'number' ? c.repetition : 0,
        dueAt: c.dueAt ? (typeof c.dueAt === 'string' ? c.dueAt : new Date(c.dueAt as unknown as string).toISOString()) : null,
        lastReviewedAt: c.lastReviewedAt ? (typeof c.lastReviewedAt === 'string' ? c.lastReviewedAt : new Date(c.lastReviewedAt as unknown as string).toISOString()) : null,
      }));
      set({ reviewQueue: queue });
    } catch (e) {
      console.error('startReview error:', e);
    } finally {
      set({ isFetchingReview: false });
    }
  },

  flipReviewCard: () => set((s) => ({ reviewFlipped: !s.reviewFlipped })),

  submitReview: async (quality: 0 | 2 | 4 | 5) => {
    const { reviewQueue, reviewIndex } = get();
    const card = reviewQueue[reviewIndex];
    if (!card || get().isSubmittingReview) return;
    set({ isSubmittingReview: true, reviewLastQuality: quality });
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review: { quality } }),
      });
      if (!res.ok) { console.error('submitReview failed:', res.status); }
      else {
        const data = await res.json();
        // Update card in the main cards array with new SM-2 state
        const updated = data.card;
        if (updated) {
          set((s) => ({
            cards: s.cards.map(c => c.id === card.id ? {
              ...c,
              mastered: updated.mastered,
              ease: typeof updated.ease === 'number' ? updated.ease : c.ease,
              interval: typeof updated.interval === 'number' ? updated.interval : c.interval,
              repetition: typeof updated.repetition === 'number' ? updated.repetition : c.repetition,
              dueAt: updated.dueAt ? (typeof updated.dueAt === 'string' ? updated.dueAt : new Date(updated.dueAt).toISOString()) : null,
              lastReviewedAt: updated.lastReviewedAt ? (typeof updated.lastReviewedAt === 'string' ? updated.lastReviewedAt : new Date(updated.lastReviewedAt).toISOString()) : null,
            } : c),
          }));
        }
      }
    } catch (e) {
      console.error('submitReview error:', e);
    } finally {
      // Advance to next card. On a lapse (quality=0), re-queue the card once
      // so it reappears at the end of this session — standard SM-2 "relearn
      // immediately" behavior. Each card gets at most one re-queue per session
      // (lapsedCardIds guard) to prevent infinite loops on truly-forgotten cards.
      const bucket = quality === 0 ? 'forgot' : quality === 2 ? 'hard' : quality === 4 ? 'good' : 'easy';
      set((s) => {
        const nextStats = { ...s.reviewStats, [bucket]: s.reviewStats[bucket] + 1 };
        // Re-queue logic: only on FORGOT, and only if not already re-queued.
        if (quality === 0 && !s.lapsedCardIds.has(card.id)) {
          const newLapsed = new Set(s.lapsedCardIds);
          newLapsed.add(card.id);
          return {
            reviewStats: nextStats,
            // Append the same card object to the END of the queue.
            reviewQueue: [...s.reviewQueue, card],
            lapsedCardIds: newLapsed,
            reviewIndex: s.reviewIndex + 1,
            reviewFlipped: false,
            isSubmittingReview: false,
          };
        }
        return {
          reviewStats: nextStats,
          reviewIndex: s.reviewIndex + 1,
          reviewFlipped: false,
          isSubmittingReview: false,
        };
      });
    }
  },

  exitReview: () => set({
    isReviewing: false,
    reviewQueue: [],
    reviewIndex: 0,
    reviewFlipped: false,
    reviewLastQuality: null,
    isSubmittingReview: false,
    isFetchingReview: false,
    lapsedCardIds: new Set(),
  }),

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
