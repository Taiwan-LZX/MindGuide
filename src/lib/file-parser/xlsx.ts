// ────────────────────────────────────────────────────────────────────────────
// file-parser/xlsx.ts — Excel parsing via SheetJS (xlsx package)
//
// Each worksheet is converted to CSV-like text with rows separated by \n and
// cells by \t. Empty cells are preserved as empty strings to maintain column
// alignment. Each sheet becomes a "section" titled "Sheet: <name>".
//
// This format preserves the tabular structure well enough for the chunker
// (which splits on \n\n) and for the AI to read tables as rows of values.
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection } from './index';
import { detectLanguage } from './index';

export async function parseXlsx(
  bytes: ArrayBuffer,
  maxChars: number
): Promise<ParsedDocument> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(bytes, { type: 'array' });

  const sections: DocSection[] = [];
  const parts: string[] = [];
  let used = 0;

  for (const sheetName of wb.SheetNames) {
    if (used >= maxChars) break;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    // Convert to "AOA" (array of arrays) — preserves empty cells.
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false, // formatted strings (e.g. dates as YYYY-MM-DD)
    });

    // Section header for this sheet.
    const sectionTitle = `Sheet: ${sheetName}`;
    const sectionStart = used;
    parts.push(`${sectionTitle}\n`);

    for (const row of aoa) {
      if (used >= maxChars) break;
      const cells = (row as unknown[]).map((c) => {
        if (c === null || c === undefined) return '';
        return String(c).replace(/[\t\r\n]+/g, ' ').trim();
      });
      // Skip fully-empty rows.
      if (cells.every((c) => c === '')) continue;
      const line = cells.join('\t');
      parts.push(line);
      used += line.length + 1;
    }
    parts.push('\n'); // sheet separator
    used += sectionTitle.length + 2;
    sections.push({
      title: sectionTitle,
      charStart: sectionStart,
      charEnd: used,
      level: 1,
    });
  }

  let text = parts.join('\n');
  if (text.length > maxChars) text = text.slice(0, maxChars);

  return {
    text,
    sections,
    metadata: { language: detectLanguage(text) },
    parser: 'xlsx',
    warnings: [],
  };
}
