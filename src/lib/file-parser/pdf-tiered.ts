// ────────────────────────────────────────────────────────────────────────────
// file-parser/pdf-tiered.ts — tiered PDF parser (fast text + VLM high-precision)
//
// This is the production PDF parser that replaces the naive unpdf-only path
// for documents that warrant higher fidelity. It implements a 3-tier strategy:
//
//   Tier 0 — TRIBE: detect scanned / image-only PDFs
//            (MuPDF text extract on first 3 pages; <50 chars/page → scanned)
//
//   Tier 1 — FAST: unpdf text extraction (existing pdf.ts)
//            Good for digital-native PDFs. Milliseconds. Free.
//            Keeps the existing heading-detection heuristic.
//
//   Tier 2 — VLM HIGH-PRECISION: MuPDF render → z-ai VLM → structured markdown
//            Invoked when:
//              (a) Tier 0 detected scanned PDF, OR
//              (b) caller passes precision='high', OR
//              (c) Tier 1 yielded suspiciously little text vs page count
//            Produces: markdown with ## headings, | tables |, $$math$$,
//            ![Figure: ...] placeholders, [PAGE N] markers.
//
//   Tier 2-LITE — MuPDF structured text (no VLM, no rendering)
//            A middle ground: MuPDF's toStructuredText gives better reading
//            order than unpdf for multi-column layouts, without the VLM cost.
//            Invoked when precision='medium' or when Tier 1 looks "OK but
//            possibly messy" (e.g. detected multi-column heuristically).
//
// The tiered parser returns the same ParsedDocument shape as the existing
// parsers, so the downstream chunker / embedder / retrieval code is unchanged.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection, DocMetadata } from './index';
import { detectLanguage } from './index';
import { parsePdf as parsePdfUnpdf } from './pdf';
import {
  detectScannedPdf,
  extractTextViaMupdf,
  renderPdfPages,
  toDataUrl,
  type RenderedPage,
} from '../pdf-renderer';
import { parsePagesViaVlm, stripPageMarker, type VlmParseOptions } from '../vlm-parser';
import {
  correctTableHtml,
  shouldCorrectTable,
  extractHtmlTables,
  replaceTableSlice,
} from '../table-correction';

export type PrecisionLevel = 'fast' | 'medium' | 'high';

export interface TieredParseOptions {
  /** Precision level. Default 'fast' (Tier 1 only).
   *  - 'fast':   unpdf text only. Instant.
   *  - 'medium': unpdf + MuPDF structured text fallback if unpdf yields little.
   *  - 'high':   unpdf + VLM high-precision on all (or selected) pages.
   */
  precision?: PrecisionLevel;
  /** Hard cap on extracted text. Default 200_000 chars. */
  maxChars?: number;
  /** For 'high' precision: which pages to send to VLM.
   *  - 'all':      every page (capped by maxVlmPages)
   *  - 'sparse':   only pages where unpdf yielded < threshold chars
   *  - 'first+toc': first page + detected table-of-contents pages + sparse
   *  Default 'sparse' (cost-effective).
   */
  vlmPageStrategy?: 'all' | 'sparse' | 'first+toc';
  /** Max pages to send to VLM. Default 60. */
  maxVlmPages?: number;
  /** VLM options forwarded as-is. */
  vlm?: VlmParseOptions;
  /** Abort signal. */
  signal?: AbortSignal;
  /**
   * P3: Run Marker-style table self-correction on VLM-parsed pages that
   * contain HTML tables. Each correctable table (>2 rows, ≤175 rows) is
   * re-verified against the page image with a strict-JSON sub-prompt and
   * self-iterates up to 3 times until score==5.
   *
   * Default: `true` when `precision === 'high'`, `false` otherwise.
   * Set explicitly to override the default.
   */
  correctTables?: boolean;
  /**
   * P3: Max self-iteration rounds per table batch. Forwarded to
   * {@link correctTableHtml}. Default 3.
   */
  tableCorrectionIterations?: number;
}

const DEFAULT_MAX_CHARS = 200_000;
const SPARSE_THRESHOLD = 200; // chars per page below which we call it "sparse"

// ─── public API ─────────────────────────────────────────────────────────────

export async function parsePdfTiered(
  bytes: ArrayBuffer,
  opts: TieredParseOptions = {}
): Promise<ParsedDocument> {
  const precision = opts.precision ?? 'fast';
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  // ── Tier 0: scanned detection (only if precision > fast, since it costs a
  //    MuPDF open + 3-page text extract). For 'fast' we skip and let unpdf
  //    surface its own "no text layer" warning.
  let scannedInfo: { scanned: boolean; avgCharsPerPage: number; pageCount: number } | null = null;
  if (precision !== 'fast') {
    try {
      scannedInfo = await detectScannedPdf(bytes);
    } catch {
      // MuPDF may fail on corrupt PDFs — fall through to unpdf.
    }
  }

  // ── Tier 1: unpdf fast path (always run — it's free and gives a baseline)
  let fast: ParsedDocument;
  try {
    fast = await parsePdfUnpdf(bytes, maxChars);
  } catch (err) {
    fast = {
      text: '',
      sections: [],
      metadata: {},
      parser: 'failed',
      warnings: [`unpdf 解析失败: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // If precision is fast, we're done.
  if (precision === 'fast') {
    return fast;
  }

  // ── Decide whether to escalate to Tier 2 (VLM) or Tier 2-Lite (MuPDF text)
  const pageCount = scannedInfo?.pageCount ?? fast.metadata.pageCount ?? 0;
  const isScanned = scannedInfo?.scanned ?? false;
  const fastCharsPerPage = pageCount > 0 ? fast.text.length / pageCount : 0;
  const fastIsSparse = fastCharsPerPage < SPARSE_THRESHOLD && fast.text.length < 1000;

  // 'medium' precision: if unpdf gave us reasonable text, keep it. If sparse,
  // try MuPDF structured text (better reading order, no VLM cost).
  if (precision === 'medium') {
    if (!fastIsSparse && fast.text.length > 1000) {
      return fast; // unpdf was good enough
    }
    try {
      const mupdfResult = await extractTextViaMupdf(bytes);
      if (mupdfResult.text.length > fast.text.length * 1.2) {
        // MuPDF did meaningfully better — use it.
        return buildParsedDocFromText({
          text: mupdfResult.text,
          pages: mupdfResult.pages,
          pageCount: mupdfResult.pageCount,
          metadata: fast.metadata,
          maxChars,
          parser: 'mupdf-text',
          warnings: [...fast.warnings, '使用 MuPDF 结构化文本提取（中精度模式）'],
        });
      }
    } catch {
      // fall through
    }
    return fast;
  }

  // ── precision === 'high' → Tier 2 VLM path
  // Determine which pages to send to VLM.
  const vlmPages = selectVlmPages({
    strategy: opts.vlmPageStrategy ?? (isScanned ? 'all' : 'sparse'),
    pageCount,
    fastText: fast.text,
    fastPages: fast.pages ?? [],
    maxVlmPages: opts.maxVlmPages ?? 60,
    maxChars,
  });

  if (vlmPages.length === 0) {
    return fast; // nothing to escalate
  }

  // Render selected pages to JPEG.
  let rendered: RenderedPage[] = [];
  try {
    rendered = await renderPdfPages(bytes, vlmPages, {
      dpi: opts.vlm?.renderDpi ?? 150,
      format: opts.vlm?.renderFormat ?? 'jpeg',
      quality: 80,
    });
  } catch (err) {
    return {
      ...fast,
      warnings: [
        ...fast.warnings,
        `VLM 渲染失败，回退至文本提取: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  // Send to VLM.
  let vlmResults;
  try {
    vlmResults = await parsePagesViaVlm(rendered, {
      ...(opts.vlm ?? {}),
      signal: opts.signal,
      maxVlmPages: opts.maxVlmPages ?? 60,
    });
  } catch (err) {
    return {
      ...fast,
      warnings: [
        ...fast.warnings,
        `VLM 调用失败，回退至文本提取: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  // ── P3: table self-correction pass ──────────────────────────────────────
  //
  // For each VLM-parsed page that contains HTML tables, re-verify each
  // correctable table against the page image (Marker-style self-iteration).
  // Tables with score >= 4 replace the original HTML in the markdown.
  //
  // This is opt-in via `correctTables` (default: true when precision='high').
  // Failures are non-fatal — the original VLM markdown is kept on any error.
  const doCorrectTables = opts.correctTables ?? (precision === 'high');
  if (doCorrectTables) {
    vlmResults = await correctTablesInVlmResults(
      vlmResults,
      rendered,
      opts.tableCorrectionIterations,
      opts.signal,
    );
  }

  // Merge VLM markdown into the fast text. Strategy:
  //   - For each VLM-parsed page, replace the corresponding page's text in
  //     `fast.text` with the VLM markdown (richer structure).
  //   - For pages NOT sent to VLM, keep the unpdf text.
  //   - Re-detect sections from the merged markdown.
  return mergeVlmIntoFast(fast, vlmResults, rendered, pageCount, maxChars);
}

// ─── P3: table self-correction pass over VLM results ────────────────────────
//
// Walks each VLM-parsed page's markdown, finds <table>…</table> blocks, and
// for each correctable one (>2 rows, ≤175 rows) asks the vision model to
// re-verify it against the page image. Corrected HTML (score ≥ 4) is spliced
// back into the markdown in-place.
//
// Returns a NEW VlmParseResult[] — the input array is not mutated. Pages
// without tables (or with uncorrectable tables) pass through unchanged.
//
// Telemetry is appended to each result's existing fields via a side-channel:
// we don't extend VlmParseResult, so warnings are accumulated and returned
// alongside (the caller merges them into the final ParsedDocument.warnings).
async function correctTablesInVlmResults(
  vlmResults: import('../vlm-parser').VlmParseResult[],
  rendered: RenderedPage[],
  maxIterations?: number,
  signal?: AbortSignal,
): Promise<import('../vlm-parser').VlmParseResult[]> {
  const out: import('../vlm-parser').VlmParseResult[] = [];
  for (let i = 0; i < vlmResults.length; i++) {
    const r = vlmResults[i];
    const page = rendered[i];
    // Pass through on error / empty / no page image.
    if (!r || r.error || !r.markdown || !page) {
      out.push(r);
      continue;
    }
    // Fast path: no tables in this page's markdown.
    const tables = extractHtmlTables(r.markdown);
    if (tables.length === 0) {
      out.push(r);
      continue;
    }

    // Build the page image data URL once (reused for every table on this page).
    const mime = page.jpeg[0] === 0x89 && page.jpeg[1] === 0x50 ? 'image/png' : 'image/jpeg';
    const dataUrl = toDataUrl(page.jpeg, mime);

    let correctedMarkdown = r.markdown;
    let totalLatency = 0;

    // Process tables in REVERSE order so char offsets of earlier tables stay
    // valid after splicing later tables. (replaceTableSlice shifts offsets
    // for content after the splice point.)
    for (let t = tables.length - 1; t >= 0; t--) {
      if (signal?.aborted) break;
      const loc = tables[t];
      if (!shouldCorrectTable(loc.html)) {
        continue;
      }
      try {
        const result = await correctTableHtml(loc.html, { dataUrl }, {
          maxIterations,
          signal,
        });
        totalLatency += result.latencyMs;
        if (result.score >= 4 && result.correctedHtml) {
          correctedMarkdown = replaceTableSlice(correctedMarkdown, loc.start, loc.end, result.correctedHtml);
        }
      } catch (err) {
        // Non-fatal — keep the original table HTML.
        console.error(`[pdf-tiered] table correction failed on page ${page.pageNumber}:`, err);
      }
    }

    out.push({
      ...r,
      markdown: correctedMarkdown,
      // Re-parse headings in case the corrected table introduced/removed any.
      // (Cheap; headings parser is regex-based.)
      latencyMs: r.latencyMs + totalLatency,
    });
  }
  return out;
}

// ─── page selection ─────────────────────────────────────────────────────────

function selectVlmPages(args: {
  strategy: 'all' | 'sparse' | 'first+toc';
  pageCount: number;
  fastText: string;
  fastPages: number[]; // char offsets
  maxVlmPages: number;
  maxChars: number;
}): number[] {
  const { strategy, pageCount, fastPages, maxVlmPages } = args;
  if (pageCount === 0) return [];

  if (strategy === 'all') {
    return Array.from({ length: Math.min(pageCount, maxVlmPages) }, (_, i) => i + 1);
  }

  if (strategy === 'sparse') {
    // Find pages where unpdf yielded < SPARSE_THRESHOLD chars.
    const sparse: number[] = [];
    for (let i = 0; i < fastPages.length; i++) {
      const start = fastPages[i];
      const end = i + 1 < fastPages.length ? fastPages[i + 1] : args.fastText.length;
      const pageText = args.fastText.slice(start, end);
      // Strip the page-boundary \n\n we added in unpdf parser.
      const cleaned = pageText.replace(/\n{2,}/g, '\n').trim();
      if (cleaned.length < SPARSE_THRESHOLD) {
        sparse.push(i + 1);
      }
      if (sparse.length >= maxVlmPages) break;
    }
    // Always include page 1 even if it wasn't sparse (title/metadata).
    if (sparse.length < maxVlmPages && !sparse.includes(1)) {
      sparse.unshift(1);
    }
    return sparse.slice(0, maxVlmPages);
  }

  // strategy === 'first+toc'
  // Heuristic: first 3 pages (cover + TOC) + sparse pages.
  const selected = new Set<number>();
  for (let i = 1; i <= Math.min(3, pageCount); i++) selected.add(i);
  // Add sparse pages.
  const sparse = selectVlmPages({
    strategy: 'sparse',
    pageCount,
    fastText: args.fastText,
    fastPages,
    maxVlmPages: maxVlmPages - selected.size,
    maxChars: args.maxChars,
  });
  for (const p of sparse) selected.add(p);
  return [...selected].sort((a, b) => a - b).slice(0, maxVlmPages);
}

// ─── merge VLM results into fast-path text ──────────────────────────────────

function mergeVlmIntoFast(
  fast: ParsedDocument,
  vlmResults: import('../vlm-parser').VlmParseResult[],
  rendered: RenderedPage[],
  pageCount: number,
  maxChars: number
): ParsedDocument {
  const warnings = [...fast.warnings];
  let vlmSuccess = 0;
  let vlmFail = 0;

  // Build a map: pageNumber → vlm markdown (cleaned, without [PAGE N] marker).
  const vlmByPage = new Map<number, string>();
  for (let i = 0; i < rendered.length; i++) {
    const r = vlmResults[i];
    const page = rendered[i];
    if (!r) continue;
    if (r.error || !r.markdown.trim()) {
      vlmFail++;
      warnings.push(`第 ${page.pageNumber} 页 VLM 解析失败: ${r.error ?? '空响应'}`);
      continue;
    }
    const { cleaned } = stripPageMarker(r.markdown);
    if (cleaned.trim()) {
      vlmByPage.set(page.pageNumber, cleaned.trim());
      vlmSuccess++;
    }
  }

  // If VLM produced nothing useful, return fast as-is.
  if (vlmByPage.size === 0) {
    warnings.push('VLM 未能解析任何页面，回退至文本提取结果');
    return { ...fast, warnings };
  }

  // Reconstruct the full text by walking pages 1..pageCount.
  // For VLM-covered pages, use the VLM markdown. For others, slice unpdf text.
  const fastPages = fast.pages ?? [];
  const parts: string[] = [];
  const newPageOffsets: number[] = [];
  let text = '';
  let used = 0;

  for (let p = 1; p <= pageCount && used < maxChars; p++) {
    newPageOffsets.push(text.length);
    let pageText: string;
    if (vlmByPage.has(p)) {
      pageText = vlmByPage.get(p)!;
    } else {
      // Slice from fast.text using page offsets.
      const start = fastPages[p - 1] ?? 0;
      const end = p < fastPages.length ? fastPages[p] : fast.text.length;
      pageText = fast.text.slice(start, end).trim();
    }
    if (pageText) {
      if (used + pageText.length > maxChars) {
        pageText = pageText.slice(0, maxChars - used);
      }
      parts.push(pageText);
      text += (text ? '\n\n' : '') + pageText;
      used += pageText.length;
    }
  }

  // Re-detect sections from the merged text. VLM markdown has ## headings
  // which our heading detector picks up via the markdown-header rule.
  const sections = detectSectionsFromMerged(text, newPageOffsets);

  const metadata: DocMetadata = {
    ...fast.metadata,
    pageCount,
    language: detectLanguage(text),
  };

  warnings.push(
    `VLM 高精度解析完成: ${vlmSuccess}/${rendered.length} 页成功${vlmFail > 0 ? `, ${vlmFail} 页失败` : ''}`
  );

  return {
    text,
    sections,
    pages: newPageOffsets,
    metadata,
    parser: 'vlm-merged',
    warnings,
  };
}

// ─── section detection (reused logic from pdf.ts) ───────────────────────────
//
// For VLM-merged text we have a higher-confidence signal: markdown ## headings
// emitted by the VLM. We parse those directly, and also run the same heuristic
// detector on non-VLM pages for consistency.

function detectSectionsFromMerged(text: string, _pageOffsets: number[]): DocSection[] {
  const sections: DocSection[] = [];
  const lines = text.split('\n');
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    // Markdown heading (## Foo) — primary signal from VLM.
    const mdMatch = trimmed.match(/^(#{2,6})\s+(.+)$/);
    if (mdMatch) {
      sections.push({
        title: mdMatch[2].trim().slice(0, 120),
        charStart: offset,
        charEnd: offset + line.length,
        level: mdMatch[1].length,
      });
    } else {
      // Fall back to heuristic for non-VLM text.
      if (isHeuristicHeading(trimmed)) {
        let level = 2;
        if (/^\d+(\.\d+)*\s+\S/.test(trimmed)) {
          const dots = (trimmed.match(/\./g) || []).length;
          level = Math.min(dots + 1, 3);
        } else if (PAPER_SECTION_RE.test(trimmed)) {
          level = 1;
        } else if (/^\p{Script=Han}{2,30}[：:]?$/u.test(trimmed) && !/[，。！？、；]/.test(trimmed)) {
          level = 2;
        }
        sections.push({
          title: trimmed.slice(0, 120),
          charStart: offset,
          charEnd: offset + line.length,
          level,
        });
      }
    }
    offset += line.length + 1; // +1 for \n
  }
  // Use page offsets to assign a page number to each section (for citations).
  // Done lazily via findPage() in the chunker; we just need charStart.
  return sections;
}

function isHeuristicHeading(line: string): boolean {
  if (line.length < 2 || line.length > 80) return false;
  if (/[.!?:;。！？：；]$/.test(line)) return false;
  if (/^[A-Z][A-Z0-9_\s-]{30,}$/.test(line)) return false;
  if (/^\d+(\.\d+)*\s+\S/.test(line)) return true;
  if (/^[A-Z][A-Z\s&/-]{2,40}$/.test(line) && /\s/.test(line)) return true;
  if (PAPER_SECTION_RE.test(line)) return true;
  if (/^\p{Script=Han}{2,30}[：:]?$/u.test(line) && !/[，。！？、；]/.test(line)) return true;
  return false;
}

const PAPER_SECTION_RE = /^(abstract|introduction|background|related\s+work|methods?|materials\s+and\s+methods|methodology|experiments?|results?|discussion|conclusions?|references?|acknowledg(e)?ments?|appendix|摘要|引言|前言|背景|相关工作|方法|实验|结果|讨论|结论|参考文献|致谢|附录)/i;

// ─── helper: build a ParsedDocument from a raw text extraction ──────────────

function buildParsedDocFromText(args: {
  text: string;
  pages: number[];
  pageCount: number;
  metadata: DocMetadata;
  maxChars: number;
  parser: ParsedDocument['parser'];
  warnings: string[];
}): ParsedDocument {
  const { text, pages, pageCount, metadata, maxChars, parser, warnings } = args;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) : text;
  // Run heuristic heading detection on the text.
  const sections: DocSection[] = [];
  const lines = truncated.split('\n');
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (isHeuristicHeading(trimmed)) {
      let level = 2;
      if (/^\d+(\.\d+)*\s+\S/.test(trimmed)) {
        const dots = (trimmed.match(/\./g) || []).length;
        level = Math.min(dots + 1, 3);
      } else if (PAPER_SECTION_RE.test(trimmed)) {
        level = 1;
      }
      sections.push({
        title: trimmed.slice(0, 120),
        charStart: offset,
        charEnd: offset + line.length,
        level,
      });
    }
    offset += line.length + 1;
  }
  return {
    text: truncated,
    sections,
    pages,
    metadata: { ...metadata, pageCount, language: detectLanguage(truncated) },
    parser,
    warnings,
  };
}
