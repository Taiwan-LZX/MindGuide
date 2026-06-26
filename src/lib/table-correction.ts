// ────────────────────────────────────────────────────────────────────────────
// table-correction.ts — Marker-style table self-correction sub-prompt
//
// Takes a VLM-generated HTML table (from vlm-parser.ts) and asks the vision
// model to verify / correct it against the original page image. This is the
// Phase 3 (P3) implementation, modelled on Marker's `table_quality_checker`
// module.
//
// Pipeline:
//   1. Show the model the page image + the current HTML table.
//   2. Ask it to output STRICT JSON: { comparison, corrected_html, analysis, score }.
//   3. Self-iterate: feed `corrected_html` back in until score == 5 OR we hit
//      `maxIterations` (default 3). Stops early on parse failure / LLM error.
//   4. Size guards (from Marker):
//        - > 175 rows → skip entirely (too large to re-verify in one shot).
//        - > 60 rows  → split into batches of 60, correct each batch with the
//                       original header repeated, then reassemble.
//
// Why self-correction? VLMs hallucinate tables less when given two passes:
//   pass 1: transcribe (done in vlm-parser.ts);
//   pass 2: critique-and-fix against image (this module).
// Marker reports ~+12 F1 on Table-Fact-Verification when adding the second pass.
//
// Why HTML (not markdown)? Markdown tables cannot express colspan/rowspan, so
// merged cells would silently degrade to repeated values. vlm-parser.ts already
// emits HTML; this module tightens it.
// ────────────────────────────────────────────────────────────────────────────

import ZAI from 'z-ai-web-dev-sdk';

// ─── size-guard constants (Marker-derived) ──────────────────────────────────

/** Skip correction entirely above this row count — tables too large to re-verify in one shot. */
const MAX_ROWS_SKIP = 175;

/** Above this row count we split into batches of this size before correcting. */
const BATCH_ROW_SIZE = 60;

/** Default self-iteration cap. Stops at score==5 or this many rounds. */
const DEFAULT_MAX_ITERATIONS = 3;

// ─── types ──────────────────────────────────────────────────────────────────

/** Page image passed to the corrector — a base64 data URL (same shape vlm-parser emits). */
export interface PageImageInput {
  /** `data:image/jpeg;base64,...` or `data:image/png;base64,...` */
  dataUrl: string;
}

/** Options for {@link correctTableHtml}. */
export interface TableCorrectionOptions {
  /** Maximum self-iteration rounds. Default 3. Stops early at score==5. */
  maxIterations?: number;
  /** Cancellation signal — checked before each LLM call. */
  signal?: AbortSignal;
}

/** Result returned by {@link correctTableHtml}. */
export interface TableCorrectionResult {
  /** The corrected `<table>...</table>` markup. Original input on hard failure. */
  correctedHtml: string;
  /** LLM's reasoning about what was structurally wrong (missing rows, wrong headers, etc.). */
  analysis: string;
  /** What changed vs the original input (from the LLM's last iteration). */
  comparison: string;
  /** 1–5 confidence/quality score (5 = perfect match to image). 0 means correction was skipped/failed. */
  score: number;
  /** How many self-iteration rounds actually ran. */
  iterations: number;
  /** Wall-clock latency in ms for the whole correction (all batches × all iterations). */
  latencyMs: number;
}

// ─── the correction sub-prompt (Marker-style) ───────────────────────────────
//
// Synthesised from Marker's `table_quality_checker` prompt + the v2 table rules
// already enforced in vlm-parser.ts. The model receives:
//   • the page image (vision input)
//   • the current HTML table (text input)
// and must return STRICT JSON with 4 fields.
const TABLE_CORRECTION_PROMPT = `You are a strict table quality auditor. You are shown:
  1. A page image containing a table.
  2. The current HTML transcription of that table.

Compare the HTML to the image and produce a corrected version.

## Output format — STRICT JSON, no other text

{
  "comparison": "What is different between the image and the current HTML. Be specific: missing rows, extra columns, wrong cell values, missed merges. If they already match, write 'No differences.'",
  "corrected_html": "<table>...</table> — the fixed HTML table. Must be a single <table> element. Use <thead>/<tbody>/<tr>/<th>/<td>. Use colspan/rowspan for merged cells. Do NOT wrap in code fences.",
  "analysis": "Structural issues found: missing rows, wrong headers, cell merges missed, column misalignment, rotated text, etc. One short paragraph.",
  "score": <integer 1-5>
}

## Scoring rubric (score)
  5 = Perfect match. Every cell value, header, and merge matches the image.
  4 = Minor issue (one wrong cell value, one missed merge) but structure is right.
  3 = Several wrong cells or one missing/extra row, but the table is still usable.
  2 = Major structural problem (wrong column count, missing thead, several missing rows) OR the table is rotated/hard to read.
  1 = HTML is broken or does not represent the image at all.

## Rules
1. Use <th> for header cells, <td> for data cells. Header cells usually live in <thead>.
2. Use colspan and rowspan attributes (integers) for merged cells. Markdown tables cannot express merges — HTML can, and must.
3. Preserve ALL data — do not skip rows or columns to save space.
4. If the table is rotated or hard to read, score <= 2.
5. Empty cells must be <td></td> (or <th></th>) — never omit a cell.
6. Keep cell text exactly as shown in the image (same numbers, same units, same language).
7. Do NOT include <br> inside table cells.
8. Do NOT wrap the JSON output in markdown code fences. Output the raw JSON object only.
9. Do NOT add commentary before or after the JSON. The response must parse with JSON.parse() after stripping fences.
10. If the current HTML is already correct, set score=5 and copy the table into corrected_html unchanged.`;

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Verify and correct a VLM-generated HTML table against the page image it was
 * transcribed from. Implements Marker-style self-iteration with size guards.
 *
 * Behaviour by size:
 *   - `> 175` rows: returns the original HTML unchanged with `score=0`
 *     (too large — would blow the prompt budget).
 *   - `> 60` rows: splits into batches of 60, corrects each batch
 *     independently (with the table header repeated in each batch), then
 *     reassembles the batches back into a single `<table>`. The returned
 *     `score` is the minimum across batches; `iterations` is the sum.
 *   - otherwise: runs the self-iteration loop on the whole table.
 *
 * @param tableHtml   Current `<table>...</table>` markup.
 * @param pageImage   Base64 data URL of the page image the table was extracted from.
 * @param opts        Optional `{ maxIterations?, signal? }`.
 * @returns           {@link TableCorrectionResult}. On hard LLM failure, returns
 *                    the original HTML with `score=0` and `analysis` describing the error.
 *
 * @example
 * ```ts
 * const result = await correctTableHtml(
 *   vlmEmittedTableHtml,
 *   { dataUrl: renderedPageDataUrl },
 *   { maxIterations: 3 },
 * );
 * if (result.score >= 4) {
 *   useTable(result.correctedHtml);
 * }
 * ```
 */
export async function correctTableHtml(
  tableHtml: string,
  pageImage: PageImageInput,
  opts?: TableCorrectionOptions,
): Promise<TableCorrectionResult> {
  const start = Date.now();
  const maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const signal = opts?.signal;

  // Guard 1: not a table.
  if (!tableHtml || !/<table[\s>]/i.test(tableHtml)) {
    return {
      correctedHtml: tableHtml,
      analysis: 'Input is not an HTML table — nothing to correct.',
      comparison: '',
      score: 0,
      iterations: 0,
      latencyMs: Date.now() - start,
    };
  }

  // Guard 2: too large — skip entirely (Marker rule).
  const rowCount = countTableRows(tableHtml);
  if (rowCount > MAX_ROWS_SKIP) {
    return {
      correctedHtml: tableHtml,
      analysis: `Table has ${rowCount} rows (> ${MAX_ROWS_SKIP}); correction skipped to control cost.`,
      comparison: '',
      score: 0,
      iterations: 0,
      latencyMs: Date.now() - start,
    };
  }

  // Guard 3: large-but-correctable — split into batches.
  if (rowCount > BATCH_ROW_SIZE) {
    const batches = splitHtmlTableByRows(tableHtml, BATCH_ROW_SIZE);
    if (batches.length <= 1) {
      // No splitting happened (e.g., malformed input) — fall through to single-shot.
      const result = await correctTableBatch(tableHtml, pageImage, maxIterations, signal);
      return { ...result, latencyMs: Date.now() - start };
    }

    const correctedBatches: string[] = [];
    let lastAnalysis = '';
    let lastComparison = '';
    let minScore = 5;
    let totalIterations = 0;
    let aborted = false;

    for (const batch of batches) {
      if (signal?.aborted) { aborted = true; break; }
      const r = await correctTableBatch(batch, pageImage, maxIterations, signal);
      correctedBatches.push(r.correctedHtml);
      lastAnalysis = r.analysis;
      lastComparison = r.comparison;
      minScore = Math.min(minScore, r.score);
      totalIterations += r.iterations;
    }

    if (aborted) {
      return {
        correctedHtml: tableHtml,
        analysis: lastAnalysis || 'Correction aborted via signal.',
        comparison: lastComparison,
        score: 0,
        iterations: totalIterations,
        latencyMs: Date.now() - start,
      };
    }

    const reassembled = reassembleBatches(correctedBatches);
    return {
      correctedHtml: reassembled,
      analysis: lastAnalysis,
      comparison: lastComparison,
      score: minScore,
      iterations: totalIterations,
      latencyMs: Date.now() - start,
    };
  }

  // Default path: single-shot self-iteration.
  const result = await correctTableBatch(tableHtml, pageImage, maxIterations, signal);
  return { ...result, latencyMs: Date.now() - start };
}

/**
 * Decide whether a table is worth correcting at all.
 *
 * Returns `true` iff:
 *   - the markup contains a `<table` tag, AND
 *   - it has more than 2 rows (short tables don't need correction), AND
 *   - it has at most {@link MAX_ROWS_SKIP} rows (too-large tables are skipped anyway).
 *
 * Use this as a pre-filter before calling {@link correctTableHtml} to avoid
 * spending a VLM call on a 2-row lookup table that the VLM already nailed.
 */
export function shouldCorrectTable(tableHtml: string): boolean {
  if (!tableHtml) return false;
  if (!/<table[\s>]/i.test(tableHtml)) return false;
  const rows = countTableRows(tableHtml);
  return rows > 2 && rows <= MAX_ROWS_SKIP;
}

// ─── self-iteration loop for a single batch ─────────────────────────────────

/**
 * Run the self-iteration loop on a single (already-batched) HTML table.
 *
 * The loop:
 *   1. Calls the VLM with the current HTML + page image.
 *   2. Parses the JSON response defensively (strip fences, slice first `{` to last `}`).
 *   3. On parse failure → break, returning the last-known-good HTML.
 *   4. On success → updates `currentHtml` from `corrected_html`, records the score.
 *   5. Stops when `score >= 5` OR `iterations >= maxIterations` OR an exception is thrown.
 *
 * `latencyMs` is left as 0 — the public caller (`correctTableHtml`) fills it in
 * because it may span multiple batches.
 */
async function correctTableBatch(
  tableHtml: string,
  pageImage: PageImageInput,
  maxIterations: number,
  signal?: AbortSignal,
): Promise<TableCorrectionResult> {
  let currentHtml = tableHtml;
  let score = 0;
  let iterations = 0;
  let analysis = '';
  let comparison = '';

  const zai = await ZAI.create();

  while (iterations < maxIterations) {
    if (signal?.aborted) break;

    let raw = '';
    try {
      const promptText = `${TABLE_CORRECTION_PROMPT}

## Current HTML table

${currentHtml}

Return the STRICT JSON object now.`;

      const completion = await zai.chat.completions.createVision({
        model: 'glm-4v',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: pageImage.dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      });

      raw = extractContent(completion);
    } catch {
      // LLM call or network failure — keep last-known-good HTML, bail out.
      break;
    }

    const parsed = parseCorrectionJson(raw);
    if (!parsed) {
      // Couldn't parse the JSON — keep currentHtml, bail out.
      break;
    }

    // Update state from the LLM's response.
    if (parsed.corrected_html) {
      // Defensively extract just the <table>…</table> slice in case the LLM
      // added stray prose around it inside the JSON string value.
      const tableMatch = parsed.corrected_html.match(/<table[\s\S]*<\/table>/i);
      if (tableMatch) {
        currentHtml = tableMatch[0].trim();
      } else if (/<table[\s>]/i.test(parsed.corrected_html)) {
        currentHtml = parsed.corrected_html.trim();
      }
      // else: keep previous currentHtml.
    }
    analysis = parsed.analysis || analysis;
    comparison = parsed.comparison || comparison;
    score = typeof parsed.score === 'number' ? clampScore(parsed.score) : score;
    iterations++;

    // Stop early on perfect score.
    if (score >= 5) break;
  }

  return {
    correctedHtml: currentHtml,
    analysis,
    comparison,
    score,
    iterations,
    latencyMs: 0, // filled in by the caller (correctTableHtml)
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Count `<tr>` rows in an HTML table. Used for size-guard decisions.
 * Counts opening `<tr>` tags (case-insensitive) — robust to whitespace and
 * attributes like `<tr class="header">`.
 *
 * @example
 *   countTableRows('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>') // → 2
 */
export function countTableRows(html: string): number {
  if (!html) return 0;
  const matches = html.match(/<tr[\s>]/gi);
  return matches ? matches.length : 0;
}

/**
 * Split a single `<table>` into multiple `<table>` chunks, each containing the
 * original `<thead>` (repeated) + up to `batchSize` body `<tr>` rows.
 *
 * Reuses the row-extraction pattern from `document-chunker.ts splitHtmlTable`:
 *   1. Extract `<thead>…</thead>` (if present) to repeat in each batch.
 *   2. Extract the `<table …>` open tag (to preserve attributes like `class`).
 *   3. Match all `<tr>…</tr>` blocks in the body (after thead, or after the
 *      open tag if no thead).
 *   4. Greedily pack rows into batches of `batchSize`, prefixing each batch
 *      with the open tag + thead, closing with `</table>`.
 *
 * If the input has no `<tr>` rows or is malformed, returns `[html]`.
 *
 * @param html        Full `<table>…</table>` markup.
 * @param batchSize   Max rows per batch (default {@link BATCH_ROW_SIZE}).
 * @returns            Array of `<table>…</table>` strings.
 *
 * @example
 *   // Splits a 150-row table into 3 batches of 60/60/30 rows.
 *   const batches = splitHtmlTableByRows(bigTableHtml, 60);
 */
export function splitHtmlTableByRows(
  html: string,
  batchSize: number = BATCH_ROW_SIZE,
): string[] {
  if (!html) return [];
  let size = batchSize;
  if (size < 1) size = 1;

  // Extract <thead>...</thead> (if present) — repeated in each batch.
  const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/i);
  const thead = theadMatch ? theadMatch[0] : '';

  // Extract <table ...> open tag — preserves class/style/attrs.
  const openTagMatch = html.match(/<table[^>]*>/i);
  const openTag = openTagMatch ? openTagMatch[0] : '<table>';

  // Find body start: prefer <tbody>, else just after thead, else after open tag.
  let bodyStart: number;
  const tbodyIdx = html.search(/<tbody[\s>]/i);
  if (tbodyIdx !== -1) {
    bodyStart = tbodyIdx;
  } else if (theadMatch && theadMatch.index !== undefined) {
    bodyStart = theadMatch.index + theadMatch[0].length;
  } else if (openTagMatch && openTagMatch.index !== undefined) {
    bodyStart = openTagMatch.index + openTagMatch[0].length;
  } else {
    bodyStart = 0;
  }
  const bodyText = html.slice(bodyStart);

  // Match every <tr>...</tr> block (non-greedy, case-insensitive, multiline).
  const rowMatches = [...bodyText.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  if (rowMatches.length === 0) {
    return [html];
  }

  const batches: string[] = [];
  for (let i = 0; i < rowMatches.length; i += size) {
    const slice = rowMatches.slice(i, i + size);
    const rowsHtml = slice.map((m) => m[0]).join('');
    batches.push(`${openTag}${thead}${rowsHtml}</table>`);
  }
  return batches;
}

/**
 * Reassemble multiple corrected `<table>` chunks back into a single `<table>`.
 *
 * Strategy: keep the first batch's open tag + thead, then concatenate the body
 * `<tr>` rows from every batch (skipping each batch's repeated thead), and
 * close with a single `</table>`.
 *
 * If only one batch is provided, returns it as-is.
 */
function reassembleBatches(batches: string[]): string {
  if (batches.length === 0) return '';
  if (batches.length === 1) return batches[0];

  // First batch supplies the open tag + thead.
  const first = batches[0];
  const openTagMatch = first.match(/<table[^>]*>/i);
  const openTag = openTagMatch ? openTagMatch[0] : '<table>';
  const firstTheadMatch = first.match(/<thead>[\s\S]*?<\/thead>/i);
  const thead = firstTheadMatch ? firstTheadMatch[0] : '';

  const allRows: string[] = [];
  for (const batch of batches) {
    // Extract <tr>...</tr> blocks from this batch (skip the repeated thead).
    const rowMatches = [...batch.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
    for (const m of rowMatches) allRows.push(m[0]);
  }
  return `${openTag}${thead}${allRows.join('')}</table>`;
}

/**
 * Extract text content from a z-ai completion response.
 * Mirrors the pattern in `vlm-parser.ts extractContent` — handles the
 * `choices[0].message.content` shape (string or JSON-stringified array).
 */
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

/**
 * Defensively parse the LLM's JSON response.
 *
 * Steps:
 *   1. Strip leading/trailing whitespace.
 *   2. Strip ` ``` ` / ` ```json ` markdown code fences (LLMs frequently add them).
 *   3. Slice from the first `{` to the last `}` (drops any prose around the JSON).
 *   4. `JSON.parse` the slice.
 *   5. Coerce the 4 expected fields to safe types.
 *
 * @returns The parsed object, or `null` on parse failure.
 */
function parseCorrectionJson(raw: string): {
  comparison: string;
  corrected_html: string;
  analysis: string;
  score: number;
} | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip markdown code fences if present.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // Slice from first { to last } to drop any surrounding prose.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const jsonSlice = text.slice(firstBrace, lastBrace + 1);
  try {
    const obj = JSON.parse(jsonSlice);
    return {
      comparison: typeof obj.comparison === 'string' ? obj.comparison : '',
      corrected_html: typeof obj.corrected_html === 'string' ? obj.corrected_html : '',
      analysis: typeof obj.analysis === 'string' ? obj.analysis : '',
      score: typeof obj.score === 'number' ? obj.score : 0,
    };
  } catch {
    return null;
  }
}

/** Clamp a numeric score to the 1–5 range (0 = unknown/failed). */
function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score < 1) return 1;
  if (score > 5) return 5;
  return Math.round(score);
}

// ─── markdown table extraction (for P3 integration in pdf-tiered.ts) ─────────
//
// VLM markdown may contain one or more HTML <table> blocks interspersed with
// prose. This helper locates every <table>...</table> slice in a markdown
// string and returns it with char offsets, so the caller can:
//   1. Decide which tables to correct (via shouldCorrectTable).
//   2. Replace the original slice with the corrected HTML in-place.

/** A located HTML table slice within a larger markdown string. */
export interface LocatedTable {
  /** The full `<table>...</table>` markup. */
  html: string;
  /** Char offset of the `<table` start tag within the source string. */
  start: number;
  /** Char offset one past the closing `</table>`. */
  end: number;
}

/**
 * Find every `<table>…</table>` block in a markdown string.
 *
 * Uses a non-greedy regex match to handle nested content safely (HTML tables
 * cannot nest, so the first `</table>` after a `<table` always closes it).
 * Returns slices in document order. Malformed tables (open with no close) are
 * skipped.
 *
 * @example
 *   const tables = extractHtmlTables('see below\n<table id="t1"><tr><td>1</td></tr></table>\nend');
 *   // → [{ html: '<table id="t1">…</table>', start: 10, end: 57 }]
 */
export function extractHtmlTables(markdown: string): LocatedTable[] {
  if (!markdown) return [];
  const out: LocatedTable[] = [];
  // Match <table ...> ... </table> (non-greedy, case-insensitive, multiline).
  // The open-tag pattern allows attributes: <table class="x" ...>.
  const re = /<table[\s>][\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push({
      html: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/**
 * Splice a corrected `<table>…</table>` back into the markdown, replacing the
 * slice at `[start, end)`. Returns the new markdown string.
 *
 * If `correctedHtml` is empty, the original slice is left unchanged (defensive
 * — never deletes a table on correction failure).
 */
export function replaceTableSlice(
  markdown: string,
  start: number,
  end: number,
  correctedHtml: string,
): string {
  if (!correctedHtml) return markdown;
  if (start < 0 || end > markdown.length || start >= end) return markdown;
  return markdown.slice(0, start) + correctedHtml + markdown.slice(end);
}
