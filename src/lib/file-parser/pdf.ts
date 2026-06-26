// ────────────────────────────────────────────────────────────────────────────
// file-parser/pdf.ts — PDF parsing via unpdf (Mozilla PDF.js wrapper)
//
// unpdf is a server-friendly wrapper around PDF.js, the same engine Firefox
// uses to render PDFs in the browser. It is pure JavaScript (no native deps)
// and works in both Node and Bun.
//
// What we extract:
//   • text        — concatenated page text, with \n\n between pages
//   • pages       — char offset where each page begins (for chunker metadata)
//   • sections    — detected via font-size heuristics in the text layer
//                   (lines that are short + title-cased + followed by blank)
//   • metadata    — title / author / subject / keywords from PDF info dict
//   • pageCount   — from the document proxy
//
// Known limitations (documented in docs/FILE-IMPORT.md §2.3):
//   • Scanned (image-only) PDFs yield empty text → caller surfaces a message.
//   • Multi-column layouts may interleave — PDF.js handles most cases.
//   • Image equations are lost; text equations are preserved as Unicode.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection, DocMetadata } from './index';
import { detectLanguage } from './index';

export async function parsePdf(
  bytes: ArrayBuffer,
  maxChars: number
): Promise<ParsedDocument> {
  // unpdf is ESM-only; dynamic import keeps the route bundle small.
  const { getDocumentProxy } = await import('unpdf');

  // Defensive copy: pdf.js (used by unpdf) transfers the underlying ArrayBuffer
  // to its WASM worker, which detaches the original `bytes`. If the caller later
  // reuses `bytes` (e.g. MuPDF rendering in the high-precision tier), it throws
  // "Cannot perform Construct on a detached ArrayBuffer". We hand pdf.js its
  // own copy so the caller's buffer stays intact.
  const input = new Uint8Array(bytes.byteLength);
  input.set(new Uint8Array(bytes));
  const pdf = await getDocumentProxy(input);

  // Metadata (PDF info dictionary). Some PDFs lack this entirely.
  let metadata: DocMetadata = {};
  try {
    const info = (pdf as any).getDocumentInfo
      ? await (pdf as any).getDocumentInfo()
      : null;
    if (info) {
      metadata = {
        title: typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined,
        author: typeof info.Author === 'string' && info.Author.trim() ? info.Author.trim() : undefined,
        subject: typeof info.Subject === 'string' && info.Subject.trim() ? info.Subject.trim() : undefined,
        keywords: typeof info.Keywords === 'string' && info.Keywords.trim() ? info.Keywords.trim() : undefined,
      };
    }
  } catch {
    // getDocumentInfo can reject on encrypted/malformed PDFs — not fatal.
  }

  const pageCount: number = (pdf as any).numPages ?? 0;
  if (pageCount > 0) metadata.pageCount = pageCount;

  // extractText returns the full text plus per-page text.
  // We use per-page extraction so we can record page boundaries.
  const pages: number[] = []; // char offsets
  const sections: DocSection[] = [];
  let text = '';
  let used = 0;

  for (let i = 1; i <= pageCount && used < maxChars; i++) {
    const pageStart = text.length;
    pages.push(pageStart);

    let pageText: string;
    try {
      const page = await (pdf as any).getPage(i);
      const content = await page.getTextContent();
      // Reconstruct text from text items, honouring explicit line breaks.
      // PDF.js text items have `str` and `hasEol` (newer versions) or are
      // separated by transform-y deltas. We use a pragmatic join: items
      // joined by spaces, with \n when the y-coordinate drops.
      const items: any[] = content.items || [];
      let lastY: number | null = null;
      const lineBuf: string[] = [];
      for (const it of items) {
        const str: string = it.str || '';
        if (!str) continue;
        // transform is [a,b,c,d,e,f]; e = x, f = y (PDF user space, origin bottom-left)
        const y = it.transform ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
          // New line.
          lineBuf.push('\n');
        } else if (lineBuf.length > 0 && !lineBuf[lineBuf.length - 1].endsWith('\n')) {
          lineBuf.push(' ');
        }
        lineBuf.push(str);
        lastY = y;
      }
      pageText = lineBuf.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    } catch {
      pageText = '';
    }

    // Page boundary marker (double newline) for chunker.
    if (pageText) {
      if (used + pageText.length > maxChars) {
        pageText = pageText.slice(0, maxChars - used);
      }
      text += (text ? '\n\n' : '') + pageText;
      used += pageText.length;

      // Detect sections on this page via heuristic:
      // a line is a heading if it is short (< 80 chars), has no terminal
      // punctuation, and the next line is blank OR starts a new paragraph.
      detectHeadings(pageText, pageStart, sections);
    }
  }

  // If we got nothing, the PDF is likely scanned (image-only).
  const warnings: string[] = [];
  if (text.trim().length === 0) {
    warnings.push('PDF 无文本层（可能为扫描件）。请上传文本版 PDF 或使用 OCR 工具转换后再导入。');
  }

  metadata.language = detectLanguage(text);

  return {
    text,
    sections,
    pages,
    metadata,
    parser: 'unpdf',
    warnings,
  };
}

// ─── heading detection heuristic ────────────────────────────────────────────
//
// Cheap, dependency-free heading detection. False positives are acceptable —
// the chunker uses sections as soft boundaries, not hard ones. False negatives
// just mean we fall back to paragraph splitting.
//
// Rules for a line to be a heading:
//   1. length 2..80 chars (after trim)
//   2. no terminal punctuation (. ! ? : ; 。 ！ ？ ：)
//   3. NOT all-uppercase ASCII longer than 30 chars (likely a code identifier)
//   4. matches one of:
//      - numbered section:  /^\d+(\.\d+)*\s+\S/         ("3.2 Methods")
//      - markdown header:   /^#{1,6}\s+\S/              ("## Methods")
//      - all-caps short:    /^[A-Z][A-Z\s&-]{2,40}$/    ("METHODS")
//      - canonical paper section keywords (Abstract, Introduction, ...)
//      - CJK short line:    /^\p{Script=Han}{2,30}[：:]?$/u  without punctuation
//   5. preceded by blank line OR at page start
//      (enforced by caller context — we accept all candidates; chunker filters)
function detectHeadings(pageText: string, pageStart: number, sections: DocSection[]): void {
  const lines = pageText.split('\n');
  let offset = pageStart;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineLen = trimmed.length;
    // advance offset by original line + \n
    offset += line.length + 1;

    if (lineLen < 2 || lineLen > 80) continue;
    if (/[.!?:;。！？：；]$/.test(trimmed)) continue;
    if (/^[A-Z][A-Z0-9_\s-]{30,}$/.test(trimmed)) continue;

    let level = 0;
    let title = trimmed;

    const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      level = mdMatch[1].length;
      title = mdMatch[2].trim();
    } else if (/^\d+(\.\d+)*\s+\S/.test(trimmed)) {
      // "3.2 Methods" — level inferred from dot count
      const dots = (trimmed.match(/\./g) || []).length;
      level = Math.min(dots + 1, 3);
    } else if (/^[A-Z][A-Z\s&/-]{2,40}$/.test(trimmed) && /\s/.test(trimmed)) {
      level = 2;
    } else if (PAPER_SECTION_RE.test(trimmed)) {
      level = 1;
    } else if (/^\p{Script=Han}{2,30}[：:]?$/u.test(trimmed) && !/[，。！？、；]/.test(trimmed)) {
      level = 2;
    } else {
      continue;
    }

    sections.push({
      title: title.slice(0, 120),
      charStart: offset - line.length - 1,
      charEnd: offset - 1,
      level,
    });
  }
}

// Canonical academic paper section headings (EN + ZH).
const PAPER_SECTION_RE = /^(abstract|introduction|background|related\s+work|methods?|materials\s+and\s+methods|methodology|experiments?|results?|discussion|conclusions?|references?|acknowledg(e)?ments?|appendix|摘要|引言|前言|背景|相关工作|方法|实验|结果|讨论|结论|参考文献|致谢|附录)/i;
