// ────────────────────────────────────────────────────────────────────────────
// file-parser/docx.ts — DOCX parsing via mammoth
//
// mammoth reads the OOXML inside the .docx zip and produces semantic HTML
// (headings become <h1>-<h6>, lists become <ul>/<ol>, tables become <table>).
// We convert that HTML to clean plain text while preserving heading structure
// so the chunker can split on section boundaries.
//
// Why mammoth over alternatives:
//   • Pure JS, no native deps, works in Bun.
//   • Industry-standard for DOCX text extraction.
//   • Preserves semantic structure (headings, lists, tables) that regex-based
//     extractors lose.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection } from './index';
import { detectLanguage } from './index';

export async function parseDocx(
  bytes: ArrayBuffer,
  maxChars: number
): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');

  // extractRawText gives clean plain text with headings inline (no <h1> tags).
  // We use it for the body text, and separately extract structure via HTML
  // so we can record section char offsets.
  const buffer = Buffer.from(bytes);

  const textResult = await mammoth.extractRawText({ buffer });
  let text: string = textResult.value || '';
  if (text.length > maxChars) text = text.slice(0, maxChars);

  // Now extract HTML to find heading positions. mammoth emits <h1>-<h6> for
  // Word headings. We walk the HTML and record where each heading lands in
  // the plain-text stream.
  //
  // Plain-text mapping heuristic: mammoth's extractRawText joins paragraphs
  // with \n\n and strips all tags, so we approximate heading char offsets by
  // searching for the heading text within the plain text. This is robust
  // enough for chunking (a missed heading just falls back to paragraph split).
  const sections: DocSection[] = [];
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html: string = htmlResult.value || '';
    const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    let searchFrom = 0;
    while ((m = headingRe.exec(html)) !== null) {
      const level = parseInt(m[1], 10);
      const title = stripTags(m[2]).trim().slice(0, 120);
      if (!title) continue;
      // Find this title in the plain text (first occurrence at or after searchFrom).
      const idx = text.indexOf(title, searchFrom);
      if (idx >= 0) {
        sections.push({ title, charStart: idx, charEnd: idx + title.length, level });
        searchFrom = idx + title.length;
      }
    }
  } catch {
    // HTML extraction failed — fall back to no sections; chunker uses paragraphs.
  }

  return {
    text,
    sections,
    metadata: {
      language: detectLanguage(text),
    },
    parser: 'mammoth',
    warnings: [],
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
