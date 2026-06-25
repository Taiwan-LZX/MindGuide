# Changelog

All notable changes to MindGuide are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-06-25

First public open-source release. MindGuide is a single-route Next.js 16
application that turns AI conversation into structured learning sessions,
with per-component animation craft as its signature.

### Added — Core functionality
- **AI dialogue** with three learning modes (Socratic / Guided / Quick)
  and SSE streaming.
- **Knowledge graph** auto-extraction with importance (1–5) and mastered
  state tracking.
- **Rich-text notes** (Tiptap v3, 17 extensions) with KaTeX, code
  highlighting, task lists — persisted per session.
- **Course generation** — AI produces structured modules + lessons,
  persisted to Prisma (`CourseModule` / `CourseLesson`).
- **Task planner** — per-session task list with priority (1–5) and done
  state.
- **Flashcards with SM-2 spaced repetition** — ease / interval /
  repetition / dueAt fields, due-queue review mode.
- **Achievements** with live progress and unlock toasts.
- **Stats** view with time distribution and streak tracking.
- **Command palette** (⌘K) with fuzzy search across sessions, features,
  and shortcuts.
- **Unified search** across all session content.
- **Settings modal** — four tabs (Appearance / Layout / Palette /
  About), `layoutId` shared-pill tab indicator, direction-aware content
  slide.
- **Keyboard shortcuts** — ⌘K, ⌘1–6, Esc, Enter, Shift+Enter, with an
  in-app overlay.

### Added — Animation system
- Per-component spring personalities:
  - `command` (380/30/0.6) — three-dots menu, command palette
  - `discovery` (280/26/0.9) — more-features panel
  - `ceremony` (200/24/1.0) — settings modal
  - `journey` (220/26/0.9) — feature-view page transitions
  - `reveal` (300/28/0.85) — course drawer
- Cursor-follow spotlight in command menus (80px radius, α 0.04).
- `layoutId` shared-element transitions for settings tab pill.
- Direction-aware feature-view transitions (forward / back x-slide).
- Per-property easing split for exit animations (opacity uses
  `snoozeOut [0.16,1,0.3,1]`; scale/y use `ease-in [0.4,0,1,1]`).
- `prefers-reduced-motion` fallback to opacity-only.

### Added — Documentation
- `README.md` — polished OSS front page with full module matrix.
- `docs/ARCHITECTURE.md` — engineering architecture, dataflow, and
  state management.
- `docs/ANIMATION.md` — animation design system with the close-bug
  postmortem (software engineering / cognitive psychology / UX
  analysis).
- `docs/CHANGELOG.md` — this file.
- `docs/CONTRIBUTING.md` — contribution guide.
- `.env.example` — environment variable template.

### Performance
- All progress bars converted from `width: %` to `transform: scaleX()`
  (composited, no layout thrash) across 5 components.
- `backdrop-filter` removed from all closeable panels — solid
  `bg-black/55` overlay instead. Eliminates 124 ms frame stall on
  settings close.
- `will-change: transform, opacity` hints on continuously-animating
  layers (spotlight, streaming bubble).
- `transformOrigin` aligned with motion direction for every panel
  (top-right / bottom-left / right / center).

### Fixed — Close-animation bugs (the 0-frame exit problem)
- **Feature-view back-exit ran 0 frames** — `AnimatePresence` was nested
  inside a synchronously-unmounted parent. Lifted `AnimatePresence` to
  `page.tsx`; direction computed atomically in Zustand. Result: 0 → 12
  frames.
- **Settings modal close had 4 frames + 124 ms stall** — caused by
  `backdrop-filter` synchronous teardown. Replaced with solid overlay.
  Result: 4 → 13 frames, stall eliminated.
- **All exit easings misapplied `ease-in` to `opacity`** — first 104 ms
  showed <2% opacity drop (imperceptible). Split per-property; opacity
  now uses `snoozeOut` so frame 1 shows a visible fade.

### Design language
- OKLCH neutral grayscale palette — no brand colors.
- Serif headings (Lora) for scholarly feel.
- 1px hairline borders, no 3D shadows.
- No emoji or decorative symbols anywhere — all status conveyed via
  Lucide icons + text.
- AI system prompt instructs the model to avoid emoji and use a
  restrained written style.

### Removed
- All 31 intermediate QA screenshots previously committed under
  `download/` — these were development artifacts, not source.
- `.env`, `.zscripts/`, `Caddyfile.mindguide` untracked from git —
  sandbox infrastructure, not MindGuide source. `.env.example` ships
  instead.

### Known limitations
- No user authentication (NextAuth.js v4 is a dependency but not wired).
- Cursor-follow spotlight falls back to static hover on touch devices.
- Feature-to-feature transitions remount the view, losing scroll
  position.

---

## Pre-release iteration history

The 1.0.0 release is the product of multiple iterative rounds, summarized
here for context. Detailed postmortems live in the project's internal
development log.

- **Round 1** — Initial deployment: 8 modules, SSE chat, Prisma schema,
  Tiptap notes. Verified end-to-end with `agent-browser` + VLM.
- **Round 2** — UI flattening: removed recessed backgrounds, inset
  shadows, gradient cards; added keyboard shortcuts (⌘1–6).
- **Round 3** — Academic paper aesthetic: serif headings, neutral
  borders, removed all emoji and decorative symbols from UI and AI
  prompts.
- **Round 4** — Mouse-follow tooltip replacing native `title` attribute
  (zero delay, follows cursor, respects module bounds).
- **Round 5** — Global spring unification: every panel standardized on
  Framer Motion springs (no CSS transitions for interactive elements).
- **Round 6** — Per-component personality differentiation (the five
  named springs) + performance polish (`scaleX` progress bars,
  `backdrop-blur` reduction).
- **Round 7** — Close-animation rewrite: the 0-frame exit bug
  postmortem and three-fix resolution documented in
  `docs/ANIMATION.md` §2.
- **Round 8** — Documentation, cleanup, and open-source sync. (This
  release.)
