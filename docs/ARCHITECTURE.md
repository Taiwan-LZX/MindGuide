# Architecture

MindGuide is a single-route Next.js 16 application. The entire user experience lives at `/` (`src/app/page.tsx`); everything else is a panel, modal, drawer, or feature view that mounts on top of that root. This document explains how the pieces fit together.

## 1. High-level dataflow

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (single route /)                │
│                                                               │
│   ┌──────────────┐    ┌──────────────────────────────────┐   │
│   │  Sidebar     │    │  MainContent                     │   │
│   │  - sessions  │    │  - WelcomeView (empty state)     │   │
│   │  - search    │    │  - ChatView (active session)     │   │
│   │  - more...   │    │  - FeatureView (tasks/cards/...) │   │
│   └──────┬───────┘    └──────────────┬───────────────────┘   │
│          │                           │                        │
│          │     Zustand stores        │                        │
│          ├───────────────────────────┤                        │
│          │  learning-store           │                        │
│          │   - sessions[]            │                        │
│          │   - activeSessionId       │                        │
│          │   - activeFeatureView     │                        │
│          │   - activeFeatureViewDir  │  ← direction for       │
│          │   - achievements[]        │    page transitions    │
│          │  preferences-store        │                        │
│          │   - theme/layout/palette  │                        │
│          └────────────┬──────────────┘                        │
│                       │                                       │
└───────────────────────┼───────────────────────────────────────┘
                        │  TanStack Query
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (/api)                   │
│  chat · sessions · messages · knowledge · references · notes  │
│  course · tasks · cards · search · stats · health             │
└───────────────────────┬───────────────────────────────────────┘
                        │  Prisma Client
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                       SQLite (db/custom.db)                    │
│  LearningSession  1─*  LearningMessage                         │
│                  1─*  KnowledgeNode                            │
│                  1─*  Reference                                │
│                  1─1  Note                                     │
│                  1─*  CourseModule  1─*  CourseLesson          │
│                  1─*  Task                                     │
│                  1─*  Card  (SM-2 spaced repetition)           │
└───────────────────────────────────────────────────────────────┘
```

## 2. Routing & view composition

There is exactly one user-visible route (`/`). All navigation is state-driven:

- `activeSessionId` — null shows `WelcomeView`; otherwise shows `ChatView` for that session.
- `activeFeatureView` — null hides the feature overlay; otherwise shows `FeatureView` for the requested module (tasks / cards / course / notes / achievements / stats).
- `activeFeatureViewDir` — direction (`1` forward, `-1` back) computed atomically in the Zustand action so `AnimatePresence` can play direction-aware enter/exit.

The `AnimatePresence` for feature transitions lives at `page.tsx` (NOT inside `FeatureView`). This is critical: if it lived inside `FeatureView`, the parent's synchronous unmount would tear down the exit animation before it could run. See `docs/ANIMATION.md` § "The 0-frame exit bug" for the postmortem.

## 3. State management

### `learning-store.ts` (Zustand)

The single source of truth for everything learner-facing:

- **Session list** — hydrated from `/api/sessions` on mount; optimistic updates on create/archive/delete.
- **Active session + messages** — fetched via TanStack Query; messages stream in through SSE.
- **Feature view routing** — `setActiveFeatureView(id)` atomically computes the direction by diffing against `prevFeatureViewRef`. Avoiding `setState`-in-`useEffect` prevents render cascades.
- **Achievements** — re-derived from `/api/stats` after every message send and knowledge toggle; toast fires on threshold crossing.

### `preferences-store.ts` (Zustand + localStorage)

Theme, layout density, accent palette. Persists to `localStorage` so preferences survive refresh. Read by `settings-view.tsx` and applied via CSS variables on `:root`.

### TanStack Query

Server state. Every API endpoint has a corresponding query key:

- `['sessions']`, `['sessions', id]`, `['sessions', id, 'messages']`, etc.
- Mutations use `onSuccess` to invalidate the relevant keys.
- SSE streaming bypasses React Query (writes directly into local state) because the stream is ephemeral; the final assistant message is persisted server-side and re-fetched on next mount.

## 4. AI dialogue pipeline

```
User submits message
        │
        ▼
POST /api/chat  (sessionId, message, mode)
        │
        ├─► 1. Persist user message          (LearningMessage.create)
        ├─► 2. Fetch session context         (last 12 messages + knowledge nodes)
        ├─► 3. Build system prompt           (mode-specific: socratic / guided / quick)
        ├─► 4. z-ai-web-dev-sdk.chat.completions  (stream: true)
        │
        ▼
SSE stream chunks  ──►  client appends to local state
        │
        ▼
Stream end  ──►  5. Persist assistant message  (LearningMessage.create)
              6. Extract knowledge nodes       (separate LLM call, batched)
              7. Update stats                  (achievement check)
              8. Return final metadata         (tokens, duration, knowledge delta)
```

**Three learning modes** alter the system prompt:

| Mode | Persona | Question density | Explanation depth |
|---|---|---|---|
| Socratic | Reluctant answerer | High (1 question per turn) | Low (hints only) |
| Guided | Patient tutor | Medium | High (full explanations) |
| Quick | Direct responder | Low | Medium (concise) |

## 5. Spaced repetition (SM-2)

`src/lib/sm2.ts` implements the classic SuperMemo-2 algorithm. Each `Card` row carries:

- `ease` (1.3–3.0) — difficulty multiplier, starts at 2.5
- `interval` (days) — days until next review
- `repetition` — consecutive correct recalls
- `dueAt` — next-due timestamp (null = never reviewed)
- `lastReviewedAt` — last review timestamp

On review (`POST /api/sessions/[id]/cards/review`), the user submits a quality grade (0–5). The algorithm updates `ease`, `interval`, `repetition`, and `dueAt` accordingly. The review queue (`GET /api/sessions/[id]/cards`) surfaces only cards where `dueAt <= now` (or never reviewed).

## 6. Animation system

The project's signature craft. Each component has its own "personality" with a unique spring profile. See [`docs/ANIMATION.md`](./ANIMATION.md) for the complete design system, including the multi-dimensional root-cause analysis (software engineering / cognitive psychology / UX) that drove the close-animation rewrite.

## 7. Performance budget

- **Bundle**: Tiptap is the heaviest dep (~380 KB gzip); route-split so it only loads when a session is active.
- **Animations**: All progress bars use `transform: scaleX()` (composited) — never `width: %` (layout thrash). See ANIMATION.md § "Performance".
- **Backdrop blur**: Avoided on closeable panels — `backdrop-filter` teardown causes a 124 ms frame stall during exit. We use solid `bg-black/55` overlays instead.
- **Database**: SQLite WAL mode, indexes on `sessionId` for every child table. All queries are `Promise.all`'d in parallel on the session hydrate path.

## 8. Known limitations

| Area | Limitation | Workaround / next step |
|---|---|---|
| Auth | No user authentication; all APIs public | Wire NextAuth.js v4 (already a dependency) |
| Streaming | AI call uses SDK streaming; client receives true SSE | Production-ready; could add abort signal plumbing |
| Mobile | Cursor-follow spotlight stays at initial position on touch | Degrade to tap-to-show on `pointer: coarse` |
| Real-time | No multi-device sync | Out of scope for v1 |

## 9. Testing strategy

- **Lint gate**: `bun run lint` must pass with 0 errors / 0 warnings. Run before every commit.
- **Browser QA**: `agent-browser` (Playwright-based) drives end-to-end flows: create session → send message → verify streaming → open feature views → toggle settings tabs → close everything. Used after every animation change to catch close-animation regressions.
- **VLM verification**: Screenshots from browser QA are passed to the vision model for layout/visual regression checks ("any broken layout? any 3D shadows leaked back in?").
