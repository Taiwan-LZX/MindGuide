// ────────────────────────────────────────────────────────────────────────────
// vlm-parser.ts — VLM-powered document page understanding (v2 — research-driven)
//
// This is the "cloud Marker/MinerU/olmOCR" replacement. Instead of running
// heavy local vision models (Marker needs surya-ocr ~2GB + GPU; MinerU needs
// ~5GB + GPU; olmOCR needs Qwen2.5-VL-7B + GPU), we send each rendered PDF
// page to the z-ai vision model with a carefully engineered prompt.
//
// ─── v2 prompt design (synthesised from 7 open-source projects) ──────────────
// Sources studied (see worklog Task 5-a/5-b/5-c/5-final):
//   • olmOCR v4  — YAML front-matter + strict LaTeX + bbox-encoded figures
//   • Nougat     — academic-paper Markdown + LaTeX math
//   • Marker     — HTML tables, section_hierarchy, block-type taxonomy
//   • Docling    — DocItemLabel enum (30 types), HybridChunker
//   • MinerU     — content_list.json typed blocks, hybrid-engine per-block decision
//   • GROBID     — TEI XML section taxonomy (abstract/intro/methods/...)
//   • PageIndex  — vectorless tree-walk retrieval
//
// Key v2 improvements over v1:
//   1. YAML front-matter (primary_language, is_table, is_diagram, rotation_correction)
//      — lets us skip lang-detection, route to table sub-prompt, retry on rotation.
//   2. Strict LaTeX: \( \) inline, \[ \] block, NO unicode math symbols (∈ ∉ ⊂ ⊃ ...).
//      — prevents ambiguous `$` (currency vs math), forces parseable LaTeX.
//   3. HTML tables (not markdown tables) — markdown can't express rowspan/colspan.
//   4. Figure bbox encoded in filename: ![desc](page_startx_starty_width_height.png)
//      — future figure-cropping is trivial, no sidecar JSON needed.
//   5. Section role classification: ## [role] Section Title
//      — enables role-aware retrieval (query "method" → boost methods chunks).
//   6. Anti-hallucination: "If no text, output null. Do not hallucinate."
//   7. Document-anchoring: inject pre-extracted text blocks between
//      RAW_TEXT_START / RAW_TEXT_END markers (olmOCR paper §3.2: "significantly
//      reduces hallucinations on born-digital PDFs").
//   8. Block-type awareness: VLM emits typed blocks (## headings, | tables |,
//      $$math$$, ![figure]) so the chunker can do struct-aware chunking.
//
// Cost control:
//   • Only invoked when (a) user opts into "high precision" mode, or
//     (b) the fast text path detected a scanned / sparse page.
//   • Pages rendered at 150 DPI JPEG q=80 (~80-150KB each).
//   • Parallelised with bounded concurrency (3) to avoid rate limits.
// ────────────────────────────────────────────────────────────────────────────

import ZAI from 'z-ai-web-dev-sdk';
import { toDataUrl, type RenderedPage } from './pdf-renderer';

// ─── types ──────────────────────────────────────────────────────────────────

/** Parsed YAML front-matter from VLM output. */
export interface VlmPageMeta {
  primaryLanguage?: string;   // 'zh' | 'en' | 'mixed' | any ISO code
  isRotationValid?: boolean;  // true if page is upright
  rotationCorrection?: number; // 0 / 90 / 180 / 270 — degrees to rotate for re-render
  isTable?: boolean;          // page contains a table → route to table-correction sub-prompt
  isDiagram?: boolean;        // page contains a diagram/flowchart
}

export interface VlmParseResult {
  /** Structured markdown for this page (or "" if VLM failed). Body only, YAML stripped. */
  markdown: string;
  /** Parsed YAML front-matter (v2). Undefined if VLM didn't emit front-matter. */
  meta?: VlmPageMeta;
  /** Detected section headings on this page (parsed from markdown ## lines). */
  headings: { title: string; level: number; role?: string }[];
  /** True if the VLM call threw — caller may retry or fall back. */
  error?: string;
  /** Wall-clock latency in ms (for telemetry / UI display). */
  latencyMs: number;
  /** Approximate token usage reported by the API (if available). */
  tokensUsed?: number;
}

export interface VlmParseOptions {
  /** Bounded concurrency for parallel page processing. Default 3. */
  concurrency?: number;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Called after each page completes — use for progress UI. */
  onProgress?: (done: number, total: number, pageNumber: number) => void;
  /** Language hint. 'auto' lets the VLM detect. */
  language?: 'zh' | 'en' | 'auto';
  /** Page-rendering options forwarded to pdf-renderer. */
  renderDpi?: number;
  renderFormat?: 'jpeg' | 'png';
  /** Max pages to send to VLM in one call. Default 60. */
  maxVlmPages?: number;
  /**
   * Document-anchoring text (v2). When provided (from MuPDF pre-extraction),
   * this text is injected between RAW_TEXT_START / RAW_TEXT_END markers in the
   * prompt. olmOCR paper §3.2 reports this "significantly reduces hallucinations"
   * on born-digital PDFs. Pass undefined to disable (scanned pages have no
   * native text layer).
   */
  anchorTexts?: Map<number, string>; // pageNumber → extracted text
}

const DEFAULTS: Required<Omit<VlmParseOptions, 'signal' | 'onProgress' | 'anchorTexts'>> = {
  concurrency: 3,
  language: 'auto',
  renderDpi: 150,
  renderFormat: 'jpeg',
  maxVlmPages: 60,
};

// ─── the v2 prompt ──────────────────────────────────────────────────────────
//
// Synthesised from olmOCR v4 (YAML + LaTeX policy) + Marker (HTML tables,
// block types) + GROBID (section roles) + Nougat (academic structure).
//
// Output contract:
//   1. YAML front-matter block (--- delimited) with 5 metadata fields.
//   2. [PAGE N] marker line.
//   3. Markdown body with:
//      - ## [role] Section headings (role optional, from GROBID taxonomy)
//      - HTML <table> for tables (NOT markdown tables — can't express merges)
//      - \( \) inline math, \[ \] display math, NO unicode math symbols
//      - ![Figure: <desc>](page_startx_starty_width_height.png) for figures
//      - - / 1. for lists
//      - Inline citations [1] / (Smith, 2020) preserved
const VLM_PAGE_PROMPT = `You are a high-precision document parser. Transcribe the provided page image into structured markdown with a YAML front-matter header.

## Output format

\`\`\`
---
primary_language: zh or en or mixed
is_rotation_valid: true or false
rotation_correction: 0 or 90 or 180 or 270
is_table: true or false
is_diagram: true or false
---
[PAGE N]
<markdown body>
\`\`\`

## Rules

1. YAML front-matter MUST appear first, delimited by --- lines. Fill all 5 fields:
   - primary_language: dominant language of the page (zh / en / mixed / ja / ko / etc.)
   - is_rotation_valid: true if the page is upright and readable; false if rotated
   - rotation_correction: degrees to rotate clockwise to make upright (0 if already valid)
   - is_table: true if the page contains a table (triggers downstream table-correction)
   - is_diagram: true if the page is predominantly a diagram/flowchart/chart

2. After YAML, the first body line MUST be exactly [PAGE N] where N is the page number.

3. Section headings: use ## for top-level, ### for sub, #### for sub-sub.
   For academic papers, prefix the heading with a role tag in brackets:
   ## [abstract] Abstract
   ## [introduction] 1. Introduction
   ## [methods] 2. Methods
   ## [results] 3. Results
   ## [discussion] 4. Discussion
   ## [conclusion] 5. Conclusion
   ## [references] References
   ## [appendix] Appendix
   Role is one of: abstract, introduction, methods, results, discussion, conclusion, references, appendix.
   For non-academic docs, omit the role tag: ## Chapter 3 / ## 实验设计.

4. TABLES: render as HTML <table><tr><th>...</th></tr><tr><td>...</td></tr></table>.
   Use colspan and rowspan for merged cells. Use <th> for header cells.
   Do NOT use markdown pipe tables (they cannot express cell merges).
   Do NOT use <br> inside table cells.

5. MATH: use \( and \) for inline math, \[ and \] for display math.
   Example: inline \(E = mc^2\), display \[\\mathcal{L} = -\\sum_i y_i \\log \\hat{y}_i\].
   Do NOT use $...$ or $$...$$ delimiters (ambiguous with currency).
   Do NOT use ascii or unicode math symbols like ∈ ∉ ⊂ ⊃ ⊆ ⊇ ∅ ∪ ∩ ∀ ∃ ¬ ≤ ≥ ≠ ≈ → ⇒ ⇔.
   Use LaTeX commands instead: \\in \\notin \\subset \\supset \\subseteq \\supseteq
   \\emptyset \\cup \\cap \\forall \\exists \\neg \\leq \\geq \\neq \\approx \\to \\Rightarrow \\Leftrightarrow.

6. FIGURES: emit a single line per figure:
   ![Figure: <one-sentence description>](page_startx_starty_width_height.png)
   where startx/starty/width/height are normalised coordinates [0,1] of the figure's
   bounding box on the page. If you cannot determine the bbox, use:
   ![Figure: <description>](page_0_0_1_1.png)
   Do NOT try to draw or reproduce the figure.

7. Preserve bullet lists (- ) and numbered lists (1. ).

8. Keep citations like [1] or (Smith, 2020) inline.

9. Read multi-column layouts in correct order (top-to-bottom per column, then left-to-right).

10. If the page is scanned/handwritten, perform OCR and transcribe faithfully.

11. Do NOT add commentary, summaries, or "This page shows...". Transcribe ONLY.

12. If the page is truly blank or has no readable text, output only the YAML + [PAGE N] and null body.

13. Do NOT wrap output in code fences (the \`\`\` above is illustrative only).

14. Preserve all text — do not skip or paraphrase. Do not hallucinate content not present on the page.`;

// ─── document-anchoring prompt suffix (olmOCR technique) ────────────────────
//
// When we have pre-extracted text (from MuPDF), we inject it between
// RAW_TEXT_START / RAW_TEXT_END markers. The VLM uses this as a "hint" to
// reduce hallucination on born-digital PDFs. This is optional — scanned pages
// have no native text layer, so anchorText is undefined.
const ANCHOR_PROMPT_TEMPLATE = `
## Pre-extracted text (for reference — use to reduce errors, but prefer the image if they disagree)

RAW_TEXT_START
{ANCHOR_TEXT}
RAW_TEXT_END

Transcribe the page image now, following all rules above. The pre-extracted text is a hint, not a constraint — if the image shows something different (e.g. better OCR, corrected characters), trust the image.`;

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Parse a batch of rendered PDF pages via the VLM.
 *
 * @param pages  Pre-rendered pages (from pdf-renderer.renderPdfPages)
 * @param opts   Options
 * @returns      One VlmParseResult per page, in the same order as input.
 */
export async function parsePagesViaVlm(
  pages: RenderedPage[],
  opts: VlmParseOptions = {}
): Promise<VlmParseResult[]> {
  const o = { ...DEFAULTS, ...opts };
  const zai = await ZAI.create();

  const results: VlmParseResult[] = new Array(pages.length);
  let done = 0;

  // Bounded-concurrency map.
  const queue = pages.map((p, i) => ({ page: p, index: i }));
  const workers: Promise<void>[] = [];

  for (let w = 0; w < o.concurrency; w++) {
    workers.push((async () => {
      while (queue.length > 0) {
        if (opts.signal?.aborted) break;
        const item = queue.shift();
        if (!item) break;
        const { page, index } = item;
        const start = Date.now();
        try {
          const mime = page.jpeg[0] === 0x89 && page.jpeg[1] === 0x50 ? 'image/png' : 'image/jpeg';
          const dataUrl = toDataUrl(page.jpeg, mime);

          // Build prompt: base prompt + optional anchor text + page marker.
          let promptText = `${VLM_PAGE_PROMPT}\n\n[PAGE ${page.pageNumber}]`;
          const anchor = opts.anchorTexts?.get(page.pageNumber);
          if (anchor && anchor.trim().length > 20) {
            // Cap anchor text to ~3000 chars to stay within prompt budget.
            const trimmed = anchor.slice(0, 3000);
            promptText += ANCHOR_PROMPT_TEMPLATE.replace('{ANCHOR_TEXT}', trimmed);
          }

          const completion = await zai.chat.completions.createVision({
            model: 'glm-4v',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
            thinking: { type: 'disabled' },
          });

          const raw = extractContent(completion);
          const { meta, markdown, body } = parseVlmOutput(raw);
          const headings = parseHeadings(markdown);
          const tokensUsed = extractUsageTokens(completion);
          results[index] = {
            markdown: body,
            meta,
            headings,
            latencyMs: Date.now() - start,
            tokensUsed,
          };
        } catch (err) {
          results[index] = {
            markdown: '',
            headings: [],
            error: err instanceof Error ? err.message : String(err),
            latencyMs: Date.now() - start,
          };
        } finally {
          done++;
          opts.onProgress?.(done, pages.length, page.pageNumber);
        }
      }
    })());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Parse a single page (convenience wrapper for tests / selective reparse).
 */
export async function parsePageViaVlm(
  page: RenderedPage,
  signal?: AbortSignal
): Promise<VlmParseResult> {
  const [r] = await parsePagesViaVlm([page], { signal, concurrency: 1 });
  return r;
}

// ─── output parsing ─────────────────────────────────────────────────────────

/**
 * Parse VLM output into YAML front-matter + body markdown.
 *
 * Handles two formats:
 *   v2 (preferred):
 *     ---
 *     primary_language: zh
 *     is_table: true
 *     ---
 *     [PAGE 1]
 *     <markdown body>
 *
 *   v1 (backward-compat — no YAML):
 *     [PAGE 1]
 *     <markdown body>
 */
export function parseVlmOutput(raw: string): {
  meta?: VlmPageMeta;
  markdown: string; // full cleaned markdown (YAML + body stripped of [PAGE N])
  body: string;     // body only (post-[PAGE N], no YAML)
} {
  if (!raw) return { markdown: '', body: '' };

  let meta: VlmPageMeta | undefined;
  let rest = raw;

  // Try to parse YAML front-matter (--- ... ---).
  const yamlMatch = rest.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (yamlMatch) {
    meta = parseYamlFrontMatter(yamlMatch[1]);
    rest = rest.slice(yamlMatch[0].length);
  }

  // Strip [PAGE N] marker.
  const { cleaned, pageNumber: _pn } = stripPageMarker(rest);
  return {
    meta,
    markdown: cleaned,
    body: cleaned,
  };
}

/** Parse a minimal YAML front-matter block (key: value pairs). */
function parseYamlFrontMatter(yaml: string): VlmPageMeta {
  const meta: VlmPageMeta = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    const val = valRaw.trim().toLowerCase();
    switch (key) {
      case 'primary_language':
        meta.primaryLanguage = valRaw.trim();
        break;
      case 'is_rotation_valid':
        meta.isRotationValid = val === 'true' || val === 'yes';
        break;
      case 'rotation_correction':
        {
          const n = parseInt(val, 10);
          if (!isNaN(n)) meta.rotationCorrection = n;
        }
        break;
      case 'is_table':
        meta.isTable = val === 'true' || val === 'yes';
        break;
      case 'is_diagram':
        meta.isDiagram = val === 'true' || val === 'yes';
        break;
    }
  }
  return meta;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Extract text content from a z-ai completion response (handles multiple shapes). */
function extractContent(completion: any): string {
  if (!completion) return '';
  const choices = completion.choices || completion.data?.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = choices[0].message || choices[0].delta;
    if (msg?.content) {
      return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    }
  }
  if (typeof completion.content === 'string') return completion.content;
  if (typeof completion.message === 'string') return completion.message;
  return '';
}

function extractUsageTokens(completion: any): number | undefined {
  const u = completion?.usage || completion?.data?.usage;
  if (u && typeof u.total_tokens === 'number') return u.total_tokens;
  if (u && typeof u.completion_tokens === 'number') return u.completion_tokens;
  return undefined;
}

/**
 * Parse markdown headings (## / ### / ####) from VLM output.
 * Handles v2 section-role syntax: ## [role] Title
 * Returns [{title, level, role?}] with level = 2/3/4.
 */
export function parseHeadings(markdown: string): { title: string; level: number; role?: string }[] {
  const out: { title: string; level: number; role?: string }[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const m = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (m) {
      const level = m[1].length;
      let title = m[2].trim();
      let role: string | undefined;
      // Check for [role] prefix.
      const roleMatch = title.match(/^\[([a-zA-Z]+)\]\s*(.*)$/);
      if (roleMatch) {
        role = roleMatch[1].toLowerCase();
        title = roleMatch[2].trim() || title;
      }
      out.push({ title, level, role });
    }
  }
  return out;
}

/**
 * Strip the [PAGE N] marker line from VLM markdown. Returns the cleaned
 * markdown and the page number (or null if no marker found).
 */
export function stripPageMarker(markdown: string): { cleaned: string; pageNumber: number | null } {
  const m = markdown.match(/^\s*\[PAGE\s+(\d+)\]\s*\n?/i);
  if (m) {
    return { cleaned: markdown.slice(m[0].length), pageNumber: parseInt(m[1], 10) };
  }
  return { cleaned: markdown, pageNumber: null };
}
