# AGENTS.md — MindGuide Agent Operating Manual

> This file is the **single source of truth** for any AI coding agent working on
> MindGuide. Read it FIRST at the start of every session. It exists to eliminate
> re-reading source files for architecture/conventions, and to prevent
> repeat mistakes. If you learn something non-obvious about the project,
> **append it here** (this file is meant to grow).

**Project**: MindGuide — AI 对话式学习平台 (conversational learning platform with
RAG-powered knowledge base, course generation, spaced-repetition cards, notes).
**Version**: 1.1.0 · **Stack**: Next.js 16 (App Router) + TypeScript 5 strict +
Prisma/SQLite + Tailwind 4 + shadcn/ui + z-ai-web-dev-sdk.

---

## 0. Agent Workflow (FOLLOW THIS — do not improvise)

For ANY non-trivial task, follow the installed `coding-agent` skill workflow:

1. **Plan** (`skills/coding-agent/planning.md`) — break into bite-sized steps,
   each with a clear output + test. Announce the plan before coding.
2. **Execute** one step at a time. Verify after each.
3. **Verify** (`skills/coding-agent/verification.md`) — see §6 Quality Gates.
4. **Review your own diff** before reporting done (see §7 Self-Review).
5. **Capture reusable patterns** via `task-review` skill (see §8).

**Skills to use by task type** (all already installed in `skills/`):

| Task | Skill | When |
|------|-------|------|
| Any multi-step code | `coding-agent` | Always — planning/verification |
| Fullstack feature | `fullstack-dev` | Next.js/Prisma/Tailwind features |
| UI/UX design | `ui-ux-pro-max` | New components, layouts, visual polish |
| Design tokens/spacing | `visual-design-foundations` | Color/type/spacing systems |
| Pre-code spec | `writing-plans` | Complex multi-file features |
| Capture done task | `task-review` | After 5+ tool calls or 3+ steps |
| Browser QA | `agent-browser` | Verify renders + golden path |
| Find new skills | `skill-finder-cn` | Need a capability not installed |

---

## 1. Hard Rules (NON-NEGOTIABLE — violating these wastes a round)

- **`bun run dev` runs automatically** in the background. **Do NOT start it.**
  Do NOT run `bun run build`. Read `/home/z/my-project/dev.log` (tail only)
  to check server health.
- **Only `/` route is user-visible.** Do not create other pages. All features
  live in `src/app/page.tsx` + components it renders.
- **Port 3000 only.** Auto dev server uses 3000; never override.
- **`z-ai-web-dev-sdk` is BACKEND-ONLY.** Never import it in a `'use client'`
  file. All AI calls go through `/api/*` routes.
- **API requests must use relative paths.** Never `fetch('http://localhost:…')`.
  For cross-service (mini-service) requests, use `?XTransformPort=<port>`
  query param — see §5 Mini-services.
- **Prisma schema primitive types cannot be lists.** Use comma-separated
  strings or JSON-encoded strings for arrays.
- **Use existing shadcn/ui components** in `src/components/ui/` — do not
  rebuild Button/Input/etc. from scratch.
- **No indigo/blue colors** unless the user explicitly requests them.
- **Footer must be sticky** to viewport bottom (`min-h-screen flex flex-col`
  wrapper + `mt-auto` footer) — see layout rules in skills/fullstack-dev.
- **User timezone**: Asia/Taipei. Interpret relative dates/times in this TZ.

---

## 2. Quality Gates (run before reporting "done")

```bash
bun run lint        # ESLint — MUST be 0 errors / 0 warnings
bun run typecheck   # tsc --noEmit — MUST be 0 errors
```

Then **browser-verify** (mandatory, not optional):
```bash
agent-browser open http://localhost:3000/
agent-browser snapshot -i -c          # confirm renders, no blank screen
# exercise the golden path of what you changed
agent-browser console                # 0 errors
agent-browser errors                 # 0 errors
```
"It compiles" / "server is up" is **never** sufficient. Browser-verified
interactivity is the required standard of done. See §7 Self-Review checklist.

---

## 3. Architecture Map

```
src/
├── app/
│   ├── page.tsx                  # THE user-visible route (everything lives here)
│   ├── layout.tsx                # root layout, theme provider, toaster
│   └── api/                      # route handlers (see §4 API Index)
├── components/
│   ├── ui/                       # shadcn primitives (button, input, sheet, …)
│   └── learning/                 # MindGuide feature components (see §5)
├── lib/                          # server-side logic (see §5 lib Index)
├── hooks/                        # React hooks (use-mobile, use-toast, …)
├── stores/                       # Zustand stores
└── types/                        # shared TS types + .d.ts shims
prisma/schema.prisma              # DB schema — run `bun run db:push` after edits
mini-services/                    # independent bun services (own port + package.json)
docs/                             # ARCHITECTURE.md, CHANGELOG.md, AGENTS.md, CODE-MAP.md
skills/                           # installed ClawHub skills (do not edit)
```

**Data flow**: User → `page.tsx` → feature components → `fetch('/api/…')` →
route handler → `lib/` (Prisma + RAG + z-ai-sdk) → SQLite → response.

---

## 4. API Route Index (24 routes)

All routes are in `src/app/api/`. Every **write** route (POST/PATCH/PUT/DELETE)
MUST validate input with zod via `src/lib/api-validator.ts` (`parseBody` helper
+ shared schemas). GET routes validate via query params.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Liveness probe |
| `/api/stats` | GET | Global dashboard stats |
| `/api/search` | GET | **Global semantic search** (documents+knowledge+sessions+messages) — see §6 |
| `/api/sessions` | GET/POST | List/create learning sessions |
| `/api/sessions/[id]` | GET/PATCH/DELETE | One session |
| `/api/sessions/[id]/messages` | GET/POST | Chat messages |
| `/api/sessions/[id]/materials` | GET/POST | Upload/list materials (FormData) |
| `/api/sessions/[id]/knowledge` | GET/POST | Knowledge nodes |
| `/api/sessions/[id]/knowledge/[id]` | PATCH | Update node |
| `/api/sessions/[id]/references` | GET/POST | Reference links |
| `/api/sessions/[id]/tasks` | GET/POST | Learning tasks |
| `/api/sessions/[id]/notes` | GET/PUT | Tiptap notes |
| `/api/sessions/[id]/cards` | GET/POST | Flashcards |
| `/api/sessions/[id]/cards/review` | POST | SM-2 review submission |
| `/api/sessions/[id]/course` | GET | Course modules+lessons |
| `/api/sessions/[id]/retrieve` | POST | Retrieve passages for a query |
| `/api/chat` | POST | **Main chat** (SSE streaming + RAG context) |
| `/api/course/generate` | POST | AI course generation |
| `/api/cards/[id]` | PATCH | Update card |
| `/api/tasks/[id]` | PATCH/DELETE | Update task |
| `/api/knowledge/[id]` | PATCH | Update knowledge node |
| `/api/materials/[id]` | GET/DELETE | One material |
| `/api/materials/[id]/chunks` | GET | Document chunks |
| `/api/materials/[id]/outline` | GET | Semantic tree outline |
| `/api/materials/[id]/reparse` | POST | Re-parse with different precision |

**Convention**: every route handler wraps body in `try/catch`, returns
`{ error: string }` with appropriate status on failure. Trace IDs via
`x-trace-id` header (auto-generated if absent).

---

## 5. lib Module Index ("where X lives")

| File | Responsibility |
|------|----------------|
| `db.ts` | Prisma client singleton — `import { db } from '@/lib/db'` |
| `api-validator.ts` | zod `parseBody` + 11 shared schemas — USE for all write routes |
| `motion-tokens.ts` | **Shared framer-motion tokens** — EASE/MOTION/panelMotion/slideMotion. USE for all animations (see §13) |
| `text-embedding.ts` | BM25-style embed/retrieve (1024-dim, base64), `tokenize`, `decodeEmbedding` |
| `retrieval.ts` | `retrievePassages()` — session RAG (BM25 + tree-walk + boosts) |
| `retrieval-boosts.ts` | **Shared** re-ranking: `applyRoleBoosts`, `applyLexicalBoosts`, `buildSnippet` |
| `search-service.ts` | `globalSearch()` — cross-source unified search (4 sources, fused) |
| `query-classifier.ts` | Classify query → academic intent (methods/results/…) |
| `role-boost.ts` | GROBID section-role boost computation |
| `document-chunker.ts` | HybridChunker (struct-aware + token-aware, max ~512 tok) |
| `semantic-index.ts` | `mdToTree()` + `flattenTreeForRetrieval()` — semantic tree builder |
| `pdf-renderer.ts` | mupdf-based PDF rendering |
| `pdf-tiered.ts` | 3-tier PDF parse (fast/balanced/high) |
| `table-correction.ts` | LLM-based table HTML correction (precision=high) |
| `vlm-parser.ts` | VLM-based page understanding |
| `file-parser/` | Per-type parsers (pdf/docx/xlsx/pptx/html/text) |
| `color-extract.ts` | Extract dominant colors (display panel) |
| `emoji-sanitize.ts` | Strip unsafe emoji from output |
| `sm2.ts` | SM-2 spaced-repetition algorithm |
| `utils.ts` | `cn()` class merge + misc |

**RAG pipeline (the heart of MindGuide)**:
```
upload → file-parser → document-chunker (HybridChunker) → embed (BM25)
       → semantic-index (mdToTree, thinning @500 tok) → persist DocumentChunk
query → retrievePassages:
  BM25 cosine (text-embedding)
  + tree-walk (LLM vectorless, glm-4-flash)        ← parallel
  + role-boost (GROBID taxonomy)                    ← shared in retrieval-boosts
  + keyword boost + CJK short-query substring boost ← shared in retrieval-boosts
  → fused + ranked topK → buildKnowledgeBaseContext → LLM prompt
```

---

## 6. Global Search (just built — Task 9)

`globalSearch()` in `search-service.ts` runs 4 sources in parallel:
- **documents** (55% quota) — DocumentChunk BM25 + role-boost + CJK + keyword (semantic)
- **knowledge** (22%) — KnowledgeNode lexical + token overlap
- **sessions** (12%) — title/topic lexical
- **messages** (18%) — content lexical

Results fused + normalised to 0-1 `relevance`. UI in `unified-search.tsx`
shows 4 category tabs + 3-seg relevance bar + source attribution + `<mark>` highlights.

---

## 7. Self-Review Checklist (run BEFORE reporting done)

After lint+typecheck pass, review your own `git diff`:

- [ ] **No `any` without a comment** explaining why (mupdf/third-party type gaps OK)
- [ ] **No `console.log`** in committed code (use `console.error` for server errors only)
- [ ] **All write routes validate input** via `api-validator.ts` (no raw `body as Type`)
- [ ] **No new files orphaned** — every new component/route is imported/used somewhere
- [ ] **Imports cleaned** — no unused (lint catches, but double-check React/lucide)
- [ ] **Error states handled** — try/catch returns `{error}` with status, not a 500 crash
- [ ] **Loading + empty states** exist for any new data-driven UI
- [ ] **Sticky footer intact** if layout touched
- [ ] **Dark mode** not broken (check both light/dark in browser)
- [ ] **No hardcoded `localhost:PORT`** in fetch/io — use relative + `XTransformPort`
- [ ] **Browser-verified** the golden path actually works (not just "it compiles")

If any box unchecked → fix before reporting. **Never** report "will fix later".

---

## 8. Reusable Patterns (run `task-review` to capture more)

When you complete a task that took 5+ tool calls or 3+ steps, and the pattern
is reusable, invoke the `task-review` skill to save it. Currently captured
patterns (append here as you add skills):

- **Add API route with zod validation**: copy `api-validator.ts` schema pattern,
  use `parseBody(req, schema)`, return `{error}` on fail. See any POST route.
- **Add learning UI component**: `'use client'`, framer-motion `type:'spring' as const`,
  shadcn primitives, `cn()` merge, dark: variants. See `unified-search.tsx`.
- **Extend RAG retrieval**: boosts live in `retrieval-boosts.ts` (shared).
  Add new boost → call from both `retrievePassages` + `globalSearch`.

---

## 9. Gotchas (learned the hard way — read these)

- **`bun run lint` can fail with "context canceled"** under load — re-run it.
- **Fast Refresh rebuilds** appear in `dev.log` as `[Fast Refresh] rebuilding` —
  normal, not an error.
- **`noImplicitAny: true`** is enforced — mupdf calls need explicit `any` casts
  with a `// third-party type gap` comment.
- **Prisma `String?` for arrays** — `tags` is comma-separated, `metadata`/`bbox`/
  `outline` are JSON strings. Parse with `try { JSON.parse(x) } catch {}`.
- **`thinking: { type: 'disabled' }`** must be set on z-ai chat completions
  unless you explicitly want reasoning.
- **`type:'spring' as const`** required for framer-motion variants (TS strict).
- **SQLite has no native vector search** — embeddings are base64 strings,
  decoded to Float32Array at query time, cosine done in JS. Fast < 2000 chunks.
- **`examples/` and `mini-services/` are excluded from typecheck/lint** —
  don't expect errors there to fail the gate.
- **`dev.log` grows fast** — only ever `tail` it, never full-read.

---

## 10. Mini-services (if needed)

Independent bun projects in `mini-services/`, each with own `package.json` +
fixed port + `index.ts` entry. Start with `bun run dev` (must support
`bun --hot` auto-restart). Frontend connects via `io("/?XTransformPort=<port>")`
or `fetch("/api/…?XTransformPort=<port>")` — NEVER direct `localhost:PORT`.

---

## 11. Commit Conventions

Conventional Commits: `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`,
`docs(scope): …`, `chore(scope): …`. Scope = search/retrieval/ui/api/etc.
Reference the Task ID from worklog.md in the commit body.

**Before commit**: `bun run lint && bun run typecheck` must both pass.
**After commit**: append a worklog.md entry (see worklog format).

---

## 12. When Stuck / Token-Conscious

- **Grep, don't read**: use the Grep tool with `-n` + `output_mode: "content"`
  to find exact lines, then `Read` with `offset`/`limit` for just that region.
- **`tail` worklog/dev.log**, never full-read.
- **One task per round** — finish + verify before starting the next.
- **This file is your memory** — if you discover a gotcha, append it to §9.

---

## 13. Animation Standards (framer-motion) — MANDATORY

All animations MUST use shared tokens from `src/lib/motion-tokens.ts`. Do NOT
inline raw `ease`/`duration`/`stiffness` values in components — they drift.

### Core principle: "Exit = Enter reversed"
The exit animation is the enter animation played backwards:
- **exit target values = `hidden` values** (the enter start point)
- **exit transition = the SAME spring** as enter

This gives perfect visual symmetry — what the user saw appear, they see
disappear. No dead-time, no ghost trail, no "stuck then snap". The brain
recognises "this is the opening in reverse" and it feels natural.

### Why NOT per-property split / ease-out exits
An earlier version used `exitSplit()` (opacity leads 160ms + transform follows
140ms ease-out). Measured close timeline exposed the flaw: opacity dropped to
0.36 in 81ms while scale only moved 1%, then the element lingered at opacity=0
for 80ms before unmount — perceived as 卡顿/鬼影. Symmetric spring fixes this:
opacity + transform share the same curve, decelerating together naturally.

### Required usage
```tsx
import { MOTION, panelMotion, slideMotion } from '@/lib/motion-tokens';

// Preset (recommended — exit already wired = hidden + same spring):
const variants = panelMotion;       // modals, panels
const variants = slideMotion;       // tabs, pages (direction-aware, custom={dir})

// Custom — exit MUST mirror hidden + use same transition as visible:
const variants = {
  hidden:  { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: MOTION.enterSoft },
  exit:    { opacity: 0, scale: 0.96, y: 12, transition: MOTION.enterSoft },
  //                          ^^^^^^^^^^^^^^^^^^^ = hidden values, = same spring
};

// Backdrop (opacity-only, symmetric tween):
initial={{ opacity: 0 }}
animate={{ opacity: 1, transition: MOTION.backdrop }}
exit={{ opacity: 0, transition: MOTION.backdropExit }}

// Spring presets by element size:
MOTION.enter        // default (panels, dropdowns, cards)
MOTION.enterSoft    // large modals (settings, course panel)
MOTION.enterSnappy  // small chips, icons, badges
```

### Forbidden patterns (cause "退出不自然/卡顿")
- ❌ exit target values ≠ hidden values (asymmetric motion)
- ❌ exit transition ≠ enter transition (different physics = jarring)
- ❌ `exit` with `type: 'spring'` BUT different stiffness/damping than enter
- ❌ `exitSplit` / per-property split (opacity + transform desync → ghost)
- ❌ `exit` with `ease: [0.4, 0, 1, 1]` (ease-in → ~80ms dead-time)
- ❌ `AnimatePresence` without `mode="wait"` for tab/page swaps (overlap)

### Special cases
- **Height animations** (sidebar createForm): spring jitters on `height: auto`,
  use symmetric tween `{ duration: 0.26, ease: EASE.INOUT }` for both enter+exit
- **List item removal with directional slide** (sidebar session delete):
  exit can use `x: -20` (slide-out semantic) but keep opacity/scale = hidden
  + same spring — the slide is the only asymmetry, and it reads as "departing"
- **Direction-aware tabs** (slideMotion): exit x = `-initialX * dir` (mirrors
  the enter direction)

### AnimatePresence mode rules
- **`mode="wait"`** — tab content, page swaps (old exits fully before new enters)
- **`mode="popLayout"`** — list add/remove (preserves layout for siblings)
- **default (sync)** — modal backdrop+panel pair (they exit together)
- **`initial={false}`** — on lists that shouldn't animate on first mount
