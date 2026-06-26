# CODE-MAP.md — File → Responsibility → Key Exports

> Lightweight index for grep-based lookup. When you need to know "which file
> exports X" or "where is Y handled", grep this file instead of full-reading
> source. Update when you add/move files.

## Core Entry Points

| Entry | File | Exports/Role |
|-------|------|--------------|
| User page | `src/app/page.tsx` | Root UI — sidebar + main content + panels |
| Root layout | `src/app/layout.tsx` | ThemeProvider, Toaster, font, metadata |
| DB client | `src/lib/db.ts` | `db` (Prisma singleton) |
| Validation | `src/lib/api-validator.ts` | `parseBody`, 11 zod schemas |

## lib/ — Server Logic

| File | Key Exports |
|------|-------------|
| `text-embedding.ts` | `embed()`, `retrieve()`, `tokenize()`, `decodeEmbedding()`, `RetrievableChunk`, `ScoredChunk`, `expandQueryWithHyDE()` |
| `retrieval.ts` | `retrievePassages(sessionId, query, topK)`, `buildKnowledgeBaseContext()`, `getSessionChunkCount()`, `RetrievedPassage` |
| `retrieval-boosts.ts` | `applyRoleBoosts()`, `applyLexicalBoosts()`, `buildSnippet()`, `ChunkV2Fields` |
| `search-service.ts` | `globalSearch(query, opts)`, `getGlobalChunkCount()`, `SearchHit`, `SearchScope`, `SearchCategory` |
| `query-classifier.ts` | `classifyQuery(query)` → `{intent, targetRoles}` |
| `role-boost.ts` | `computeRoleBoost(sectionRole, classification)` |
| `document-chunker.ts` | `chunkDocument(text, opts)`, `HybridChunker` |
| `semantic-index.ts` | `mdToTree()`, `flattenTreeForRetrieval()`, `SemanticTreeNode` |
| `pdf-tiered.ts` | `parsePdfTiered(buffer, opts)` — 3-tier (fast/balanced/high) |
| `pdf-renderer.ts` | mupdf page rendering |
| `table-correction.ts` | `correctTableHtml({html, dataUrl})` — LLM table fix |
| `vlm-parser.ts` | VLM page understanding |
| `sm2.ts` | SM-2 spaced-repetition calc |
| `color-extract.ts` | dominant color extraction |
| `emoji-sanitize.ts` | `sanitizeEmoji(text)` |
| `utils.ts` | `cn()` (clsx+twMerge) |

## lib/file-parser/ — Per-Type Parsers

| File | Handles |
|------|---------|
| `pdf.ts` | `.pdf` (via mupdf/unpdf) |
| `docx.ts` | `.docx` (mammoth) |
| `xlsx.ts` | `.xlsx/.xlsm` |
| `pptx.ts` | `.pptx` |
| `html.ts` | `.html/.htm` |
| `text.ts` | `.txt/.md/.json/.csv` + ATX heading detection |
| `index.ts` | `parseFile()` dispatcher |

## components/learning/ — Feature UI

| File | Role |
|------|------|
| `sidebar.tsx` | Session list + UnifiedSearch + create-new |
| `main-content.tsx` | Chat thread + composer |
| `unified-search.tsx` | Global semantic search dropdown (4 categories) |
| `feature-views.tsx` | Feature switcher (knowledge/course/cards/notes/tasks) |
| `knowledge-inline.tsx` | Inline knowledge node editor |
| `course-panel.tsx` | Course module/lesson tree |
| `card-review-mode.tsx` | SM-2 flashcard review UI |
| `tiptap-editor.tsx` | Rich text notes editor |
| `markdown-renderer.tsx` | Markdown → React (syntax highlight) |
| `command-palette.tsx` | ⌘K command palette |
| `settings-view.tsx` | Settings panel |
| `display-panel.tsx` | Appearance settings |
| `appearance-popover.tsx` | Theme/appearance popover |
| `create-new-panel.tsx` | New session creation flow |
| `keyboard-shortcuts-overlay.tsx` | Shortcuts help overlay |
| `scroll-progress.tsx` | Reading progress bar |
| `mouse-follow-tooltip.tsx` | Cursor-following tooltip |
| `loading-utils.tsx` | Skeleton/spinner presets |

## components/ui/ — shadcn Primitives (do not rebuild)

`button`, `input`, `separator`, `sheet`, `skeleton`, `toast`, `toaster`, `tooltip`
(Deleted as unused: `dialog`, `label`, `sidebar`, `textarea`, `toggle` — do NOT
re-add unless a consumer needs them.)

## hooks/ — React Hooks

| Hook | Purpose |
|------|---------|
| `use-mobile.tsx` | Responsive breakpoint detection |
| `use-toast.ts` | Toast notifications (shadcn) |

## stores/ — Zustand

Session/UI state management. Import named stores, never mutate directly.

## types/ — Shared Types

| File | Purpose |
|------|---------|
| `react-syntax-highlighter.d.ts` | Type shim for untyped package |

## API Routes — by Function

### Chat & RAG
- `POST /api/chat` — main SSE chat (zod: `chatSchema`)
- `POST /api/sessions/[id]/retrieve` — retrieve passages (zod: `retrieveSchema`)

### Sessions
- `GET/POST /api/sessions` — list/create (zod: `createSessionSchema`)
- `GET/PATCH/DELETE /api/sessions/[id]` — one session (PATCH zod: `updateSessionSchema`)

### Materials & Chunks
- `GET/POST /api/sessions/[id]/materials` — upload (FormData: `materialSchema`)
- `GET/DELETE /api/materials/[id]` — one material
- `GET /api/materials/[id]/chunks` — list chunks
- `GET /api/materials/[id]/outline` — semantic tree
- `POST /api/materials/[id]/reparse` — re-parse

### Knowledge
- `GET/POST /api/sessions/[id]/knowledge` — nodes (POST needs `{nodes:[]}`)
- `PATCH /api/knowledge/[id]` — update (zod: `updateKnowledgeNodeSchema`)

### Cards (SM-2)
- `GET/POST /api/sessions/[id]/cards` — list/create (zod: `createCardSchema`)
- `POST /api/sessions/[id]/cards/review` — submit review
- `PATCH /api/cards/[id]` — update

### Tasks
- `GET/POST /api/sessions/[id]/tasks` — list/create (zod: `createTaskSchema`)
- `PATCH/DELETE /api/tasks/[id]` — update (zod: `updateTaskSchema`)

### Other
- `GET/POST /api/sessions/[id]/messages` — chat history (zod: `createMessageSchema`)
- `GET/POST /api/sessions/[id]/references` — links
- `GET/PUT /api/sessions/[id]/notes` — Tiptap notes
- `GET /api/sessions/[id]/course` — course modules
- `POST /api/course/generate` — AI course gen
- `GET /api/search` — global semantic search (`q, limit, scope, sessionId`)
- `GET /api/stats` — dashboard stats
- `GET /api/health` — liveness

## Prisma Models (schema.prisma)

| Model | Purpose | Key relations |
|-------|---------|---------------|
| `LearningSession` | A learning conversation | → messages, nodes, refs, notes, modules, tasks, cards, materials |
| `LearningMessage` | Chat message | → session |
| `KnowledgeNode` | Extracted concept | → session |
| `Reference` | External link | → session |
| `Note` | Tiptap notes (1:1 session) | → session |
| `CourseModule` / `CourseLesson` | AI course | module → lessons |
| `Task` | Study plan item | → session |
| `LearningMaterial` | Uploaded doc | → chunks, session |
| `DocumentChunk` | RAG retrieval unit | → material. v2 fields: blockType/sectionPath/page/bbox/sectionRole |
| `Card` | Flashcard (SM-2) | → session |

## Mini-services

(If added) each in `mini-services/<name>/` with `index.ts` + `package.json` +
fixed port. Connect via `?XTransformPort=<port>`.
