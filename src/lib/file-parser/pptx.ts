// ────────────────────────────────────────────────────────────────────────────
// file-parser/pptx.ts — PowerPoint parsing via jszip
//
// PPTX is a ZIP archive of OOXML. Each slide lives at:
//   ppt/slides/slideN.xml
// and contains text inside <a:t>...</a:t> runs (DrawingML text namespace).
//
// We extract:
//   • one "section" per slide, titled "Slide N: <first non-empty line>"
//   • text runs joined with spaces, paragraphs separated by \n
//   • slide boundaries marked with \n\n for the chunker
//
// Notes: charts and SmartArt are not parsed (their text is in separate XML
// parts with more complex structure). For most lecture decks the slide text
// runs are sufficient.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection } from './index';
import { detectLanguage } from './index';

export async function parsePptx(
  bytes: ArrayBuffer,
  maxChars: number
): Promise<ParsedDocument> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);

  const sections: DocSection[] = [];
  const parts: string[] = [];
  let used = 0;

  // Find all slide XML files, sort by slide number.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });

  for (let i = 0; i < slidePaths.length; i++) {
    if (used >= maxChars) break;
    const path = slidePaths[i];
    const slideNum = i + 1;

    const xml = await zip.files[path].async('string');

    // Extract paragraphs (<a:p>) and within them text runs (<a:t>).
    const paragraphs: string[] = [];
    const pRe = /<a:p\b[\s\S]*?<\/a:p>/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = pRe.exec(xml)) !== null) {
      const pXml = pMatch[0];
      const tRe = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
      const runs: string[] = [];
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRe.exec(pXml)) !== null) {
        const text = decodeXml(tMatch[1]);
        if (text) runs.push(text);
      }
      const para = runs.join(' ').trim();
      if (para) paragraphs.push(para);
    }

    if (paragraphs.length === 0) continue;

    const slideText = paragraphs.join('\n');
    const title = paragraphs[0].slice(0, 80);
    const sectionTitle = `Slide ${slideNum}: ${title}`;

    const sectionStart = used;
    parts.push(`${sectionTitle}\n${slideText}\n\n`);
    used += sectionTitle.length + slideText.length + 3;

    sections.push({
      title: sectionTitle,
      charStart: sectionStart,
      charEnd: used,
      level: 1,
    });
  }

  let text = parts.join('');
  if (text.length > maxChars) text = text.slice(0, maxChars);

  return {
    text,
    sections,
    metadata: { language: detectLanguage(text) },
    parser: 'pptx',
    warnings: [],
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
