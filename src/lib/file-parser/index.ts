// ────────────────────────────────────────────────────────────────────────────
// file-parser/index.ts — unified document parser
//
// Parses uploaded files into a normalised ParsedDocument shape:
//   • text        — full plain text (clean prose, no markup)
//   • sections    — structured outline (title + char range + level)
//   • pages       — page boundaries (PDF only; null otherwise)
//   • metadata    — title, author, subject, keywords, pageCount, language
//   • parser      — which parser was used (for transparency / debugging)
//
// Dispatch is by file extension first, MIME type second. Each parser is
// wrapped in try/catch so a single malformed file never crashes the upload
// batch — instead it returns an empty ParsedDocument with parser='failed'
// and the caller can surface a clear "未提取文本" status.
// ────────────────────────────────────────────────────────────────────────────

import { parsePdf } from './pdf';
import { parsePdfTiered, type PrecisionLevel, type TieredParseOptions } from './pdf-tiered';
import { parseDocx } from './docx';
import { parseXlsx } from './xlsx';
import { parsePptx } from './pptx';
import { parseHtml } from './html';
import { parseText } from './text';

export interface DocSection {
  title: string;
  charStart: number;
  charEnd: number;
  level: number; // 1 = top-level (h1 / chapter), 2 = h2 / section, ...
}

export interface DocMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  pageCount?: number;
  language?: 'zh' | 'en' | 'mixed';
}

export interface ParsedDocument {
  text: string;
  sections: DocSection[];
  pages?: number[]; // char offset where each page begins (PDF only)
  metadata: DocMetadata;
  parser:
    | 'unpdf'
    | 'mammoth'
    | 'xlsx'
    | 'pptx'
    | 'html'
    | 'text'
    | 'failed'
    | 'mupdf-text'   // Tier 2-Lite: MuPDF structured text (medium precision)
    | 'vlm-merged';  // Tier 2: VLM high-precision merged with fast path
  warnings: string[];
}

export interface ParseOptions {
  /** Hard cap on extracted text length. Default 200_000 chars (~50k tokens). */
  maxChars?: number;
  /** PDF precision level. 'fast' (default) uses unpdf only; 'medium' falls
   * back to MuPDF structured text for sparse PDFs; 'high' invokes the VLM
   * for scanned/complex pages. Non-PDF files ignore this. */
  precision?: PrecisionLevel;
  /** Tiered-parse options forwarded to the PDF parser (precision='high'). */
  tiered?: Omit<TieredParseOptions, 'maxChars' | 'precision' | 'signal'>;
}

const DEFAULT_MAX_CHARS = 200_000;

// ─── dispatcher ─────────────────────────────────────────────────────────────

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Detect the dominant language of extracted text.
 * Threshold: >30% Han characters → 'zh', >70% ASCII → 'en', else 'mixed'.
 */
export function detectLanguage(text: string): 'zh' | 'en' | 'mixed' {
  if (!text) return 'mixed';
  const sample = text.slice(0, 2000);
  const han = (sample.match(/\p{Script=Han}/gu) || []).length;
  const ascii = (sample.match(/[a-zA-Z]/g) || []).length;
  const total = sample.length || 1;
  if (han / total > 0.3) return 'zh';
  if (ascii / total > 0.7) return 'en';
  return 'mixed';
}

/**
 * Parse an uploaded file into a ParsedDocument.
 *
 * Strategy:
 *   1. Pick parser by file extension (fall back to MIME type).
 *   2. Parser throws → return empty doc with parser='failed'.
 *   3. Truncate to maxChars (preserve section boundaries).
 *   4. Detect language.
 */
export async function parseFile(
  bytes: ArrayBuffer,
  filename: string,
  mimeType: string,
  options: ParseOptions = {}
): Promise<ParsedDocument> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const ext = getExtension(filename);
  const mime = (mimeType || '').toLowerCase();

  let result: ParsedDocument;
  try {
    if (ext === 'pdf' || mime === 'application/pdf') {
      // Route through the tiered parser. For 'fast' precision it delegates to
      // the existing unpdf parser; for 'medium'/'high' it escalates to MuPDF
      // text / VLM as needed.
      if (options.precision && options.precision !== 'fast') {
        result = await parsePdfTiered(bytes, {
          precision: options.precision,
          maxChars,
          ...(options.tiered ?? {}),
        });
      } else {
        result = await parsePdf(bytes, maxChars);
      }
    } else if (
      ext === 'docx' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      result = await parseDocx(bytes, maxChars);
    } else if (
      ext === 'xlsx' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      result = await parseXlsx(bytes, maxChars);
    } else if (
      ext === 'pptx' ||
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      result = await parsePptx(bytes, maxChars);
    } else if (
      ext === 'html' || ext === 'htm' ||
      mime.includes('html')
    ) {
      result = parseHtml(bytes, maxChars);
    } else if (
      ext === 'doc' || ext === 'xls' || ext === 'ppt'
    ) {
      // Legacy binary Office formats — no pure-JS parser; surface clearly.
      result = {
        text: '',
        sections: [],
        metadata: {},
        parser: 'failed',
        warnings: [`旧版 .${ext} 格式暂不支持，请转换为 .${ext}x 后再上传`],
      };
    } else {
      // txt / md / markdown / csv / json / code / log / yaml / xml / rtf etc.
      result = parseText(bytes, filename, mime, maxChars);
    }
  } catch (err) {
    console.error(`[file-parser] ${filename} parse error:`, err);
    result = {
      text: '',
      sections: [],
      metadata: {},
      parser: 'failed',
      warnings: [`解析失败: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // Final safety: enforce maxChars on text (parsers already do this, but
  // belt-and-braces for any parser that overshoots).
  if (result.text.length > maxChars) {
    result.text = result.text.slice(0, maxChars);
    result.warnings.push(`文本已截断至 ${maxChars} 字符`);
  }

  // Fill in language if the parser didn't.
  if (!result.metadata.language) {
    result.metadata.language = detectLanguage(result.text);
  }

  return result;
}

// Re-export individual parsers for testing / direct use.
export { parsePdf, parseDocx, parseXlsx, parsePptx, parseHtml, parseText };
