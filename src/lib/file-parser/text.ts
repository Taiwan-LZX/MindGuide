// ────────────────────────────────────────────────────────────────────────────
// file-parser/text.ts — plain text / markdown / code / structured text
//
// Handles everything that is already text:
//   txt, md, markdown, csv, json, log, rtf, html-fragment,
//   yaml, yml, toml, ini, xml,
//   js, jsx, ts, tsx, py, rb, go, rs, java, c, cpp, h, hpp, cs, php, swift,
//   kt, scala, sh, bash, zsh, ps1, sql, graphql, proto
//
// For Markdown we additionally detect ATX headers (#, ##, ###) as sections
// so the chunker can split on them.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection } from './index';
import { detectLanguage, getExtension } from './index';

export function parseText(
  bytes: ArrayBuffer,
  filename: string,
  _mimeType: string,
  maxChars: number
): ParsedDocument {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  let text = raw.length > maxChars ? raw.slice(0, maxChars) : raw;

  const ext = getExtension(filename);
  const sections: DocSection[] = [];

  // Always detect ATX markdown headers (#, ##, ###) — not just for .md files.
  // This is safe (the regex is specific: # at line start + whitespace) and
  // ensures the semantic tree (mdToTree) + struct-aware chunker work for any
  // text file that uses markdown-style headings (e.g. academic notes saved as
  // .txt, exported chat logs, etc.).
  {
    const lines = text.split('\n');
    let offset = 0;
    for (const line of lines) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) {
        const level = m[1].length;
        const title = m[2].trim().slice(0, 120);
        sections.push({
          title,
          charStart: offset,
          charEnd: offset + line.length,
          level,
        });
      }
      offset += line.length + 1; // +1 for \n
    }
  }

  if (ext === 'csv') {
    // CSV: each row is a line; first row is often a header.
    // We don't promote it to a section, but the chunker will split on \n\n
    // which won't appear in CSV — so we insert a blank line every 50 rows
    // to give the chunker natural break points.
    const lines = text.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      if ((i + 1) % 50 === 0) out.push(''); // blank line every 50 rows
    }
    text = out.join('\n');
  } else if (ext === 'json') {
    // Pretty-print JSON if it's a single line (common for API exports).
    try {
      const obj = JSON.parse(text);
      text = JSON.stringify(obj, null, 2);
    } catch {
      // leave as-is
    }
  }

  return {
    text,
    sections,
    metadata: {
      language: detectLanguage(text),
    },
    parser: 'text',
    warnings: [],
  };
}
