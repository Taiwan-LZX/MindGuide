# File Import & Knowledge Base — Research & Implementation

This document records the research that informed MindGuide's file-import pipeline
(PDF / DOCX / XLSX / PPTX / HTML / Markdown / plain text), the structural
packaging strategy, and the retrieval-augmented generation (RAG) integration.

---

## 1. Problem Statement

MindGuide learners upload study materials (academic papers, textbook chapters,
lecture notes, spreadsheets). The system must:

1. **Parse** the file into clean plain text — including PDFs with multi-column
   layouts, equations, tables, and CJK content.
2. **Package** the text into structural units that the model can consume
   efficiently — not a giant blob, not isolated fragments.
3. **Retrieve** the most relevant units at query time so the AI tutor and the
   course generator can ground their answers in the learner's own material.
4. **Persist** everything so a refresh doesn't lose the knowledge base.

The sandbox constraint is critical: **no GPU, no Python runtime, Bun/Node only**.
This rules out most state-of-the-art research models and forces a pragmatic
architecture.

---

## 2. Research Survey — PDF Parsing (the hardest format)

### 2.1 SOTA research models (academic, 2023–2024)

| System | Lab / Year | Approach | Strengths | Limitations |
|--------|------------|----------|-----------|-------------|
| **Nougat** | Meta AI, 2023 | VLM (Vision-Language Model) fine-tuned on academic papers | Best accuracy for math-heavy papers; outputs Mathpix Markdown with LaTeX equations | Requires GPU; ~5s/page on A100; Python only |
| **Marker** | VikParuchuri, 2024 | Deep learning pipeline (layout detection + OCR + table recognition) | SOTA PDF→Markdown; handles tables, equations, headers | Python + GPU; 4–10 GB VRAM |
| **MinerU** | OpenDataLab, 2024 | LayoutLMv3 + donut + formula recognition | Best open-source; complex multi-column layouts | Python + GPU; heavy deps |
| **GROBID** | Patrice Lopez, 2008– | CRF + TEI structured output | Excellent metadata + reference parsing for academic papers | Java; production server; not pure extraction |
| **LayoutLMv3** | Microsoft, 2022 | Multimodal transformer (text + layout + image) | Foundation for many doc-AI tasks | Requires fine-tuning; GPU |
| **Donut** | Naver, 2022 | OCR-free document understanding | No external OCR engine | GPU; English-centric |

**Verdict for MindGuide**: All SOTA research models require Python + GPU, which
the sandbox cannot provide. We adopt a **tiered fallback strategy**:

1. **Primary (this sandbox)**: `unpdf` — Mozilla PDF.js wrapper, pure JS,
   battle-tested in Firefox, no native deps.
2. **Future upgrade path**: when the project is deployed to a host with Python +
   GPU, swap `unpdf` for `marker` or `nougat` via a pluggable adapter. The
   `DocumentChunk` schema and RAG retrieval layer are designed to be
   parser-agnostic.

### 2.2 Practical JS-based PDF parsers

| Library | Mechanism | Accuracy | Native deps | Notes |
|---------|-----------|----------|-------------|-------|
| **unpdf** | Wraps PDF.js (Mozilla) in a Node-friendly API | High for text-based PDFs | None | Best choice for sandbox; supports page boundaries, metadata |
| pdf-parse | Thin wrapper over PDF.js | Medium | None | Older, less maintained; no page-level info |
| pdfjs-dist (raw) | PDF.js directly | High | None | Lower-level; requires manual worker setup |
| pdf2json | Mozilla PDF.js fork | Medium | None | Event-based API, awkward to use |

**Decision**: `unpdf` — best balance of accuracy, dependency surface, and
ergonomics. Built on the same PDF.js engine Firefox uses to render PDFs in the
browser.

### 2.3 Known limitations of PDF.js (and hence unpdf)

- **Scanned PDFs** (image-only, no text layer): PDF.js cannot OCR. For these
  we surface a clear "无文本层，请提供文本版或图片版以使用 VLM OCR" message.
  A future iteration can render pages to images and call the VLM endpoint
  (`zai.chat.completions.createVision`) for OCR.
- **Complex multi-column layouts**: PDF.js sometimes interleaves columns.
  We mitigate by post-processing with a column-detection heuristic (line
  x-coordinate clustering) — see §4.2.
- **Math equations**: rendered as Unicode where the PDF embeds them as text;
  image equations are lost. Acceptable trade-off for v1.

---

## 3. Research Survey — Other formats

| Format | Library | Approach | Notes |
|--------|---------|----------|-------|
| DOCX | `mammoth` | Read OOXML, extract semantic HTML / plain text | Industry standard; preserves headings, lists, tables |
| XLSX | `xlsx` (SheetJS) | Read OOXML, convert sheets to CSV / row arrays | Handles formulas (cached values), multi-sheet |
| PPTX | `jszip` + manual XML | PPTX is ZIP of `ppt/slides/slideN.xml`; extract `<a:t>` text runs | No good pure-JS lib; manual extraction is robust |
| HTML | `node-html-parser` (optional) / regex strip | Parse DOM, remove script/style, extract text | Regex strip is good enough for v1 |
| Markdown | native | Keep as-is; the chunker recognises ATX headers | — |
| Plain text / code | `TextDecoder` | UTF-8 decode | — |

---

## 4. Structural Packaging (Chunking)

### 4.1 Why not just "stuff everything into the prompt"?

The brute-force approach (inject up to 30k chars of material content into the
prompt) has three problems:

1. **Context dilution**: when the model sees 30k chars of irrelevant material,
  it loses focus on the learner's actual question (Lost in the Middle,
  Liu et al. 2023).
2. **Token cost**: every chat turn re-sends the full 30k chars.
3. **No precision**: the model can't tell which 200-char snippet is relevant.

### 4.2 Chunking strategy (multi-level)

MindGuide uses a **3-level structural chunker**:

**Level 1 — Document outline detection**:
- Markdown: split by ATX headers (`#`, `##`, `###`).
- Academic papers: regex-detect canonical sections
  (`Abstract`, `Introduction`, `Methods`, `Results`, `Discussion`,
  `Conclusion`, `References`) in both English and Chinese.
- PDF: use page boundaries from `unpdf` as a secondary structure signal.
- HTML: split by `<h1>`–`<h6>` tags.

**Level 2 — Recursive character split** (LangChain-style):
- Target chunk size: **800 chars** (≈ 200 tokens, a comfortable retrieval unit).
- Overlap: **120 chars** (15%) — prevents splitting mid-sentence.
- Hierarchy: paragraph (`\n\n`) → sentence (`\. `) → line (`\n`) → word.
- Each chunk stores its parent section title as metadata.

**Level 3 — Token-aware truncation**:
- Final safety cap: no chunk exceeds **1500 chars**.
- Approximate token count: `chars / 4` (English) or `chars / 2` (CJK).

### 4.3 Parent-child chunk pairs

For each leaf chunk we also store the parent section text (up to 4000 chars).
At retrieval time we return **both** the leaf chunk (for precision) and the
parent section (for context). This emulates Anthropic's "contextual retrieval"
pattern (2024) without requiring a separate LLM call per chunk.

---

## 5. Embedding & Retrieval (no embedding API available)

### 5.1 The constraint

`z-ai-web-dev-sdk` exposes `chat.completions`, `images.generations`,
`audio.tts/asr`, and `web_search` / `page_reader` — but **no embeddings
endpoint**. We cannot call a hosted embedding model.

### 5.2 Solution: BM25-style hashed TF-IDF (pure TypeScript)

This is the same family of algorithms that powered search engines before
neural retrievers (Elasticsearch's BM25, Lucene's default scorer). It is:

- **Deterministic** (same input → same vector)
- **Fast** (~µs per chunk, no network call)
- **Language-aware** (separate tokenizers for CJK and Latin)
- **Storage-efficient** (1024-dim Float32 = 4 KB/chunk; for 1000 chunks = 4 MB)

**Algorithm**:

1. **Tokenize**:
   - CJK (`\p{Script=Han}`): extract overlapping **bigrams** ("机器学习" →
     ["机器", "器学", "学习"]). Bigrams capture compound-noun semantics that
     unigrams miss.
   - Latin: lowercase, split on non-alphanumeric, remove stopwords
     (the/a/an/is/are/...).
2. **Hash + count**: each token is hashed (`FNV-1a`) to a bucket in [0, 1024).
   Increment the bucket by `1` (term frequency). The sign is determined by
   the hash's high bit (countervailing the "all-positive" bias of hashed
   representations — this is the "hashed signatures" trick from
   Weinberger et al. 2009).
3. **L2-normalize** the resulting 1024-dim vector.
4. **Cosine similarity** = dot product of two L2-normalized vectors
   (reduces to a single dot product).

### 5.3 Hybrid retrieval (BM25 + structural boost)

At query time, for each chunk we compute:

```
score = cosine(query_vec, chunk_vec)      // lexical BM25-style
      + 0.15 * sectionBoost(chunk)         // title/abstract sections weighted higher
      + 0.05 * recencyBoost(chunk)         // newer materials slightly preferred
```

Top-K (default 6) chunks are returned, with their parent sections attached.

### 5.4 Optional: HyDE (Hypothetical Document Embeddings)

For complex learner questions, we can call `zai.chat.completions.create` with
a short prompt asking the model to **generate a hypothetical answer** in the
learner's own material's style. We then embed the hypothetical answer and use
it for retrieval. This bridges the lexical gap (Gao et al. 2023).

**Status**: implemented as `expandQueryWithHyDE()` but **disabled by default**
(added latency, marginal gain for short learner questions). Can be enabled
per-session in a future iteration.

---

## 6. RAG Integration

### 6.1 Before (brute-force)

```ts
// /api/chat/route.ts (old)
const materials = await db.learningMaterial.findMany({ where: { sessionId } });
context += materials.map(m => m.content).join('\n\n').slice(0, 20_000);
```

### 6.2 After (RAG)

```ts
// /api/chat/route.ts (new)
const query = message;  // the learner's latest message
const chunks = await retrieveRelevantChunks(sessionId, query, { topK: 6 });
context += chunks.map(c => `[${c.section}] ${c.content}`).join('\n\n---\n\n');
```

Same for `/api/course/generate`: instead of injecting the first 30k chars of
all materials, retrieve the chunks most relevant to the learner's identified
knowledge gaps.

### 6.3 New API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /api/sessions/[id]/materials` | Upload + parse + chunk + embed (extended) |
| `GET /api/sessions/[id]/materials` | List materials (with chunk count, outline) |
| `GET /api/materials/[id]` | Single material with full content |
| `GET /api/materials/[id]/outline` | Structural outline (sections) |
| `GET /api/materials/[id]/chunks?page=N` | Paginated chunk viewer |
| `POST /api/sessions/[id]/retrieve` | RAG retrieval: `{ query } → { chunks[] }` |
| `DELETE /api/materials/[id]` | Remove material + its chunks |

---

## 7. Storage Schema

```
LearningMaterial (extended)
  id, sessionId, filename, fileType, size, title
  content        — full extracted plain text (capped 200k chars)
  charCount, status, createdAt, updatedAt
  + parser       — 'unpdf' | 'mammoth' | 'xlsx' | 'pptx' | 'html' | 'text'
  + pageCount    — PDF page count (null for non-PDF)
  + language     — 'zh' | 'en' | 'mixed' (heuristic)
  + outline      — JSON: [{ title, charStart, charEnd, level }]
  + chunkCount   — denormalised for fast list view

DocumentChunk (new)
  id, materialId
  content        — chunk text (≤ 1500 chars)
  section        — parent section title (e.g. "3.2 Methods")
  chunkIndex     — ordinal within material
  charStart, charEnd
  tokens         — approximate token count
  embedding      — JSON string of 1024 Float32 (L2-normalised)
  metadata       — JSON: { page, level, isTitle, ... }
```

---

## 8. References

- Blecher, L. et al. (2023). *Nougat: Neural Optical Understanding for Academic Documents.* arXiv:2308.13418.
- Liu, N.F. et al. (2023). *Lost in the Middle: How Language Models Use Long Contexts.* TACL.
- Gao, L. et al. (2023). *Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE).* arXiv:2212.10496.
- Weinberger, K. et al. (2009). *Feature Hashing for Large Scale Multitask Learning.* ICML.
- Robertson, S. & Zaragoza, H. (2009). *The Probabilistic Relevance Framework: BM25 and Beyond.* FTIR.
- Anthropic (2024). *Introducing Contextual Retrieval.* anthropic.com/news/contextual-retrieval.
- Mozilla Foundation. *PDF.js.* github.com/mozilla/pdf.js — the rendering engine wrapped by `unpdf`.
