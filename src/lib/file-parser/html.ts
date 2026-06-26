// ────────────────────────────────────────────────────────────────────────────
// file-parser/html.ts — HTML parsing via regex tag stripping
//
// For v1 we use a robust regex stripper rather than a DOM parser. This handles
// 99% of real-world HTML (including malformed) and avoids a native dependency.
// The chunker doesn't need a DOM tree — it needs clean text + heading
// boundaries, both of which regex extraction provides.
//
// Strategy:
//   1. Remove <script> / <style> / <noscript> blocks entirely.
//   2. Extract <h1>-<h6> + <title> text as sections (record char offsets).
//   3. Strip all remaining tags.
//   4. Decode HTML entities (&nbsp; &amp; &lt; &gt; &#NN;).
//   5. Collapse whitespace.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection } from './index';
import { detectLanguage } from './index';

export function parseHtml(bytes: ArrayBuffer, maxChars: number): ParsedDocument {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // 1. Remove script/style/noscript/template blocks.
  const cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<template[\s\S]*?<\/template>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2. Walk the cleaned HTML, building plain text + recording heading offsets.
  //    We do a single regex pass that matches either a heading tag or any tag.
  const sections: DocSection[] = [];
  const out: string[] = [];
  let plainLen = 0;
  let title: string | undefined;

  const tokenRe = /<(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|&[a-zA-Z#0-9]+;|[^<&]+/g;
  let m: RegExpExecArray | null;
  let inHeadingLevel = 0;
  let headingBuf = '';
  let headingStart = 0;

  while ((m = tokenRe.exec(cleaned)) !== null && plainLen < maxChars) {
    const tok = m[0];
    if (tok[0] === '<') {
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      if (tag === 'title' && !closing) {
        // capture <title> for metadata
        const endIdx = cleaned.indexOf('</title>', tokenRe.lastIndex);
        if (endIdx >= 0) {
          title = stripTags(cleaned.slice(tokenRe.lastIndex, endIdx)).trim().slice(0, 200);
          tokenRe.lastIndex = endIdx + 8;
        }
      } else if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag[1], 10);
        if (!closing) {
          inHeadingLevel = level;
          headingBuf = '';
          headingStart = plainLen;
        } else if (inHeadingLevel === level) {
          const headingText = headingBuf.trim().replace(/\s+/g, ' ');
          if (headingText && headingText.length <= 120) {
            sections.push({
              title: headingText,
              charStart: headingStart,
              charEnd: plainLen,
              level,
            });
          }
          inHeadingLevel = 0;
          headingBuf = '';
        }
      } else if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'br' || tag === 'tr') {
        // Block-level close → paragraph break.
        if (!closing || tag === 'br') {
          out.push('\n');
          plainLen += 1;
        } else {
          out.push('\n');
          plainLen += 1;
        }
      }
      // All other tags are dropped (inline ones don't affect text flow).
    } else if (tok[0] === '&') {
      const decoded = decodeEntity(tok);
      if (inHeadingLevel) headingBuf += decoded;
      out.push(decoded);
      plainLen += decoded.length;
    } else {
      if (inHeadingLevel) headingBuf += tok;
      out.push(tok);
      plainLen += tok.length;
    }
  }

  let text = out.join('');
  // Collapse runs of whitespace but preserve paragraph breaks (\n\n).
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length > maxChars) text = text.slice(0, maxChars);

  return {
    text,
    sections,
    metadata: {
      title,
      language: detectLanguage(text),
    },
    parser: 'html',
    warnings: [],
  };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeEntity(ent: string): string {
  const named: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&apos;': "'", '&#39;': "'",
    '&copy;': '(c)', '&reg;': '(R)', '&trade;': '(TM)',
    '&hellip;': '...', '&mdash;': '—', '&ndash;': '–',
    '&laquo;': '«', '&raquo;': '»', '&middot;': '·',
  };
  if (named[ent]) return named[ent];
  const numMatch = ent.match(/^&#(\d+);$/);
  if (numMatch) {
    const cp = parseInt(numMatch[1], 10);
    if (cp > 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
  }
  const hexMatch = ent.match(/^&#x([0-9a-fA-F]+);$/);
  if (hexMatch) {
    const cp = parseInt(hexMatch[1], 16);
    if (cp > 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
  }
  return ent; // unknown entity — leave as-is
}
