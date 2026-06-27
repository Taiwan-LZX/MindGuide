// ────────────────────────────────────────────────────────────────────────────
// document-chunker.ts — structural text packaging for model consumption
//
// Turns a ParsedDocument into a list of retrieval-sized chunks that preserve
// structural context. Implements a 3-level strategy (see docs/FILE-IMPORT.md §4):
//
//   Level 1 — section-aware splitting (markdown headers / paper sections /
//             page boundaries for PDF / slide boundaries for PPTX)
//   Level 2 — recursive character split with overlap
//             (paragraph → sentence → line → word, target 800 chars, 120 overlap)
//   Level 3 — token-aware truncation (hard cap 1500 chars per chunk)
//
// Each chunk records its enclosing section title so retrieval can apply a
// structural boost (Abstract / Introduction chunks rank higher) and so the
// model sees the section context when grounded.
//
// Token estimation: chars/4 for Latin, chars/2 for CJK (heuristic — avoids
// pulling in a full tokenizer; matches GPT-family averages well enough for
// budgeting).
// ────────────────────────────────────────────────────────────────────────────

import type { ParsedDocument, DocSection } from './file-parser';

// ─── v2 block-type taxonomy (Docling DocItemLabel, trimmed) ─────────────────
//
// Each chunk is classified into one of these types. The classifier is
// heuristic (regex-based) for now — Phase 2 will upgrade to VLM-emitted types.
// The taxonomy matches the GROBID/Docling/Marker consensus:
export type BlockType =
  | 'text'       // default prose paragraph
  | 'title'      // heading / section title
  | 'table'      // contains HTML <table> or markdown pipe table
  | 'figure'     // contains ![Figure: ...](...) image reference
  | 'formula'    // contains \[...\] or $$...$$ display math
  | 'list'       // bullet/numbered list (majority of lines start with - / 1.)
  | 'code'       // fenced code block (```...```)
  | 'caption'    // figure/table caption ("Figure 1:", "Table 2:")
  | 'reference'  // bibliography entry ([1] Author, Title, ...)
  | 'header'     // page header (running title)
  | 'footer';    // page footer (page number, copyright)

// GROBID section taxonomy roles for academic papers.
export type SectionRole =
  | 'abstract'
  | 'introduction'
  | 'methods'
  | 'results'
  | 'discussion'
  | 'conclusion'
  | 'references'
  | 'appendix';

/** Bounding box in normalised page coordinates [0,1]. */
export interface BBox {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

export interface Chunk {
  content: string;
  section: string;     // enclosing section title ("" if none) — legacy v1 field
  chunkIndex: number;  // ordinal within the material
  charStart: number;   // offset in original text
  charEnd: number;
  tokens: number;      // approximate
  metadata: {
    page?: number;     // 1-based PDF page (if applicable)
    level: number;     // section level (1=h1, 2=h2, ...)
    isTitle: boolean;  // chunk is mostly a heading
    sectionStart?: number; // charStart of the parent section (for parent retrieval)
  };
  // ── v2 fields (P1) ────────────────────────────────────────────────────────
  /** Block type classification (heuristic). See BlockType union. */
  blockType: BlockType;
  /** Slash-delimited breadcrumb of enclosing section titles, e.g. "3 Methods / 3.2 Training". */
  sectionPath: string;
  /** 1-based PDF page (mirrors metadata.page for convenience / direct DB column). */
  page?: number;
  /** Bounding box in normalised page coords [0,1]. Undefined for pure text. */
  bbox?: BBox;
  /** GROBID section role for academic papers (undefined for non-academic). */
  sectionRole?: SectionRole;
}

// ─── HybridChunker options (P2 — token-aware, struct-aware) ────────────────
//
// Upgraded from char-based (800/120/1500) to token-based (512/768/64),
// synthesised from Docling HybridChunker + Marker block-atomicity.
// The chunker now:
//   1. Segments text into typed blocks (table/formula/figure/code/text/title/list)
//   2. Merges adjacent blocks into chunks up to `targetTokens` (512)
//   3. Treats table/formula/figure/code as ATOMIC — never splits mid-block
//   4. When a table exceeds `maxTokens`, splits it but repeats the <thead> header
//   5. Merges tiny peer chunks (< `minTokens` = 64) into neighbors
export interface ChunkOptions {
  /** Target chunk size in tokens (default 512 — Docling/Marker consensus). */
  targetTokens?: number;
  /** Hard cap per chunk in tokens (default 768). Atomic blocks exceeding this are split. */
  maxTokens?: number;
  /** Chunks below this token count merge with neighbors (default 64). */
  minTokens?: number;
  /** Overlap in tokens for recursive-split fallback (default 64). */
  overlapTokens?: number;
  // ── Legacy char-based fields (kept for backward-compat, ignored in v2) ──────
  /** @deprecated use targetTokens */
  targetSize?: number;
  /** @deprecated use overlapTokens */
  overlap?: number;
  /** @deprecated use maxTokens */
  maxChars?: number;
}

const DEFAULTS: Required<Pick<ChunkOptions, 'targetTokens' | 'maxTokens' | 'minTokens' | 'overlapTokens'>> = {
  targetTokens: 512,
  maxTokens: 768,
  minTokens: 64,
  overlapTokens: 64,
};

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * HybridChunker (P2) — struct-aware + token-aware document chunking.
 *
 * Algorithm (synthesised from Docling HybridChunker + Marker block-atomicity):
 *   1. `segmentIntoBlocks()` — walk text, split into typed atomic blocks
 *      (table / formula / figure / code / title / list / text).
 *   2. `mergeBlocksIntoChunks()` — greedily pack blocks into chunks up to
 *      `targetTokens` (512). Atomic blocks (table/formula/figure/code) are
 *      NEVER split mid-block unless they exceed `maxTokens` (768).
 *   3. When a table exceeds `maxTokens`, split it with `splitTableWithHeaderRepeat()`
 *      — each sub-chunk repeats the `<thead>` so it's self-describing.
 *   4. `mergeTinyPeers()` — chunks < `minTokens` (64) merge into neighbors.
 *
 * Each chunk records v2 fields: blockType, sectionPath, page, bbox, sectionRole.
 */
export function chunkDocument(doc: ParsedDocument, opts: ChunkOptions = {}): Chunk[] {
  const o = { ...DEFAULTS, ...opts };
  if (!doc.text || doc.text.trim().length === 0) return [];

  // Sort sections by charStart so we can binary-search for the enclosing one.
  const sections = [...doc.sections].sort((a, b) => a.charStart - b.charStart);

  // Section stack resolver: for any char offset, compute the slash-delimited
  // breadcrumb of enclosing section titles + the GROBID role of the deepest section.
  const sectionPathAt = (pos: number): { path: string; role?: SectionRole } => {
    const stack: DocSection[] = [];
    for (const s of sections) {
      if (s.charStart <= pos) {
        while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
        stack.push(s);
      } else break;
    }
    const path = stack.map((s) => s.title).join(' / ');
    const role = stack.length ? detectSectionRole(stack[stack.length - 1].title) : undefined;
    return { path, role };
  };

  // 1. Segment into typed blocks.
  const blocks = segmentIntoBlocks(doc.text);

  // 2. Merge blocks into token-aware chunks (block-atomic).
  const rawChunks = mergeBlocksIntoChunks(blocks, doc, sections, sectionPathAt, o);

  // 3. Merge tiny peer chunks into neighbors.
  const merged = mergeTinyPeers(rawChunks, o);

  // 4. Re-index after merging.
  merged.forEach((c, i) => (c.chunkIndex = i));

  return merged;
}

// ─── block segmentation ─────────────────────────────────────────────────────
//
// Walks the text and splits it into typed blocks. Atomic block types
// (table / formula / figure / code) are detected by their delimiters and kept
// intact. Non-atomic types (title / list / text) are split at paragraph
// boundaries (\n\n).

interface Block {
  type: BlockType;
  text: string;
  charStart: number;
  charEnd: number;
  tokens: number;
}

function makeBlock(type: BlockType, text: string, start: number, end: number): Block {
  const slice = text.slice(start, end);
  return { type, text: slice, charStart: start, charEnd: end, tokens: estimateTokens(slice) };
}

/**
 * Segment text into typed blocks. Atomic types (table/formula/figure/code)
 * are detected by delimiters and kept intact. Non-atomic types are split at
 * paragraph (\n\n) boundaries.
 */
function segmentIntoBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Skip leading whitespace/newlines.
    while (i < len && /\s/.test(text[i])) i++;
    if (i >= len) break;

    const rest = text.slice(i);

    // 1. Code fence ```...```
    if (rest.startsWith('```')) {
      const closeIdx = text.indexOf('```', i + 3);
      const blockEnd = closeIdx === -1 ? len : closeIdx + 3;
      blocks.push(makeBlock('code', text, i, blockEnd));
      i = blockEnd;
      continue;
    }

    // 2. HTML table <table>...</table>
    const tableOpen = rest.match(/<table[\s>]/i);
    if (tableOpen && tableOpen.index === 0) {
      const closeMatch = rest.match(/<\/table>\s*/i);
      const blockEnd = closeMatch ? i + closeMatch.index! + closeMatch[0].length : findParaEnd(text, i);
      blocks.push(makeBlock('table', text, i, blockEnd));
      i = blockEnd;
      continue;
    }

    // 3. Display math \[...\]
    if (rest.startsWith('\\[')) {
      const closeIdx = text.indexOf('\\]', i + 2);
      const blockEnd = closeIdx === -1 ? len : closeIdx + 2;
      blocks.push(makeBlock('formula', text, i, blockEnd));
      i = blockEnd;
      continue;
    }

    // 4. Figure ![Figure:...](...) or generic image
    const figMatch = rest.match(/^!\[(?:Figure:)?[^\]]*\]\([^)]*\)\s*/im);
    if (figMatch && figMatch.index === 0) {
      const blockEnd = i + figMatch[0].length;
      blocks.push(makeBlock('figure', text, i, blockEnd));
      i = blockEnd;
      continue;
    }

    // 5. Heading ## / ### / # (title block — also a section boundary)
    const headMatch = rest.match(/^(#{1,6})\s+.+\s*$/m);
    if (headMatch && headMatch.index === 0) {
      const lineEnd = text.indexOf('\n', i);
      const blockEnd = lineEnd === -1 ? len : lineEnd + 1;
      blocks.push(makeBlock('title', text, i, blockEnd));
      i = blockEnd;
      continue;
    }

    // 6. Default: text paragraph until next \n\n or next special block.
    const paraEnd = findParaEnd(text, i);
    const paraText = text.slice(i, paraEnd);

    // Check if paragraph is a markdown pipe table (|---| separator line).
    if (/^\s*\|[-:\s|]+\|\s*$/m.test(paraText)) {
      blocks.push(makeBlock('table', text, i, paraEnd));
    } else if (isListParagraph(paraText)) {
      blocks.push(makeBlock('list', text, i, paraEnd));
    } else {
      blocks.push(makeBlock('text', text, i, paraEnd));
    }
    i = paraEnd;
  }

  return blocks;
}

/** Find the end of the paragraph starting at `from` (next \n\n or EOF). */
function findParaEnd(text: string, from: number): number {
  const len = text.length;
  // Look for \n\n.
  for (let i = from; i < len - 1; i++) {
    if (text[i] === '\n' && text[i + 1] === '\n') return i + 2;
  }
  // Also break at code fence / table / heading starts to keep blocks clean.
  for (let i = from; i < len; i++) {
    const rest = text.slice(i);
    if (rest.startsWith('```') || /^<table[\s>]/i.test(rest) || rest.startsWith('\\[') ||
        /^!\[(?:Figure:)?[^\]]*\]\(/.test(rest) || /^#{1,6}\s/.test(rest)) {
      return i;
    }
  }
  return len;
}

/** Check if a paragraph is predominantly a list (≥60% lines start with - / * / N.). */
function isListParagraph(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const listLines = lines.filter((l) => /^\s*([-*•]|\d+[.)])\s+\S/.test(l)).length;
  return listLines / lines.length >= 0.6;
}

// ─── block → chunk merging (token-aware, block-atomic) ─────────────────────

/**
 * Greedily pack blocks into chunks up to `targetTokens`. Atomic blocks
 * (table / formula / figure / code) are flushed as standalone chunks and
 * never merged with neighbors. Oversized atomic blocks are split via
 * `splitTableWithHeaderRepeat` (tables) or `recursiveSplit` (others).
 */
function mergeBlocksIntoChunks(
  blocks: Block[],
  doc: ParsedDocument,
  sections: DocSection[],
  sectionPathAt: (pos: number) => { path: string; role?: SectionRole },
  o: Required<Pick<ChunkOptions, 'targetTokens' | 'maxTokens' | 'minTokens' | 'overlapTokens'>>
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  let buf: Block[] = [];
  let bufTokens = 0;
  let bufStart = 0;

  const flushBuffer = () => {
    if (buf.length === 0) return;
    const rawText = buf.map((b) => b.text).join('');
    const content = cleanChunkContent(rawText);
    if (content.length < 20) {
      buf = [];
      bufTokens = 0;
      return;
    }
    const charStart = bufStart;
    const charEnd = buf[buf.length - 1].charEnd;
    const section = findEnclosingSection(sections, charStart);
    const page = findPage(doc, charStart);
    const { path: sectionPath, role: sectionRole } = sectionPathAt(charStart);
    const blockType = dominantBlockType(buf);
    chunks.push({
      content,
      section: section?.title ?? '',
      chunkIndex: chunkIndex++,
      charStart,
      charEnd,
      tokens: estimateTokens(content),
      metadata: {
        page,
        level: section?.level ?? 0,
        isTitle: blockType === 'title',
        sectionStart: section?.charStart,
      },
      blockType,
      sectionPath,
      page,
      sectionRole,
    });
    buf = [];
    bufTokens = 0;
  };

  for (const block of blocks) {
    const isAtomic = block.type === 'table' || block.type === 'formula' ||
                     block.type === 'figure' || block.type === 'code';

    if (isAtomic) {
      // Flush any accumulated text/list blocks first.
      flushBuffer();

      if (block.tokens > o.maxTokens) {
        // Oversized atomic block — must split.
        if (block.type === 'table') {
          // Tables: split with header repeat so each sub-chunk is self-describing.
          for (const sub of splitTableWithHeaderRepeat(block, o)) {
            const section = findEnclosingSection(sections, sub.charStart);
            const page = findPage(doc, sub.charStart);
            const { path: sectionPath, role: sectionRole } = sectionPathAt(sub.charStart);
            chunks.push({
              content: sub.content,
              section: section?.title ?? '',
              chunkIndex: chunkIndex++,
              charStart: sub.charStart,
              charEnd: sub.charEnd,
              tokens: sub.tokens,
              metadata: { page, level: section?.level ?? 0, isTitle: false, sectionStart: section?.charStart },
              blockType: 'table',
              sectionPath,
              page,
              sectionRole,
            });
          }
        } else {
          // Formula / figure / code: hard split via recursiveSplit.
          const tempChunk: Chunk = {
            content: cleanChunkContent(block.text),
            section: findEnclosingSection(sections, block.charStart)?.title ?? '',
            chunkIndex,
            charStart: block.charStart,
            charEnd: block.charEnd,
            tokens: block.tokens,
            metadata: { page: findPage(doc, block.charStart), level: 0, isTitle: false },
            blockType: block.type,
            sectionPath: sectionPathAt(block.charStart).path,
            page: findPage(doc, block.charStart),
            sectionRole: sectionPathAt(block.charStart).role,
          };
          chunks.push(...recursiveSplit(tempChunk, o));
          chunkIndex = chunks.length;
        }
      } else {
        // Fits within maxTokens — emit as standalone chunk.
        const content = cleanChunkContent(block.text);
        if (content.length >= 10) {
          const section = findEnclosingSection(sections, block.charStart);
          const page = findPage(doc, block.charStart);
          const { path: sectionPath, role: sectionRole } = sectionPathAt(block.charStart);
          chunks.push({
            content,
            section: section?.title ?? '',
            chunkIndex: chunkIndex++,
            charStart: block.charStart,
            charEnd: block.charEnd,
            tokens: block.tokens,
            metadata: { page, level: section?.level ?? 0, isTitle: block.type === 'title', sectionStart: section?.charStart },
            blockType: block.type,
            sectionPath,
            page,
            sectionRole,
          });
        }
      }
      continue;
    }

    // Non-atomic (text / title / list): accumulate into buffer.
    if (buf.length === 0) bufStart = block.charStart;

    // If adding this block would exceed maxTokens, flush first.
    if (buf.length > 0 && bufTokens + block.tokens > o.maxTokens) {
      flushBuffer();
      bufStart = block.charStart;
    }

    buf.push(block);
    bufTokens += block.tokens;

    // If we've hit the target, flush to produce a chunk of ~targetTokens.
    if (bufTokens >= o.targetTokens) {
      flushBuffer();
    }
  }
  flushBuffer();

  return chunks;
}

/**
 * Determine the dominant block type in a buffer of mixed blocks.
 * Returns 'text' unless a non-text type has > 30% of the buffer's tokens
 * (so a heading mixed with paragraphs doesn't get misclassified as 'title').
 */
function dominantBlockType(buf: Block[]): BlockType {
  const totalTokens = buf.reduce((s, b) => s + b.tokens, 0);
  if (totalTokens === 0) return 'text';
  const counts = new Map<BlockType, number>();
  for (const b of buf) counts.set(b.type, (counts.get(b.type) ?? 0) + b.tokens);
  let best: BlockType = 'text';
  let bestTokens = 0;
  for (const [type, tok] of counts) {
    // Non-text types must have > 30% share to dominate (avoids a single
    // heading line misclassifying a whole text paragraph as 'title').
    if (type !== 'text' && tok > bestTokens && tok / totalTokens > 0.3) {
      best = type;
      bestTokens = tok;
    }
  }
  return best;
}

// ─── table split with header repeat (Marker convention) ─────────────────────
//
// When a table exceeds maxTokens, we split it into row-batches. Each sub-chunk
// repeats the <thead> (or first row) so the table is self-describing in
// retrieval — a chunk with only <td> cells and no headers is useless.
//
// For markdown pipe tables, the first 2 lines (header + separator) are repeated.

interface TableSubChunk {
  content: string;
  charStart: number;
  charEnd: number;
  tokens: number;
}

function splitTableWithHeaderRepeat(block: Block, o: Required<Pick<ChunkOptions, 'maxTokens' | 'overlapTokens'>>): TableSubChunk[] {
  const text = block.text;
  const maxTok = o.maxTokens;

  // Detect HTML table.
  if (/<table[\s>]/i.test(text)) {
    return splitHtmlTable(block, maxTok);
  }

  // Markdown pipe table: split by rows, repeat header + separator.
  const lines = text.split('\n');
  if (lines.length < 3) {
    // Can't split a tiny table — return as-is.
    return [{ content: cleanChunkContent(text), charStart: block.charStart, charEnd: block.charEnd, tokens: block.tokens }];
  }
  const header = lines.slice(0, 2); // header row + |---| separator
  const headerText = header.join('\n') + '\n';
  const headerTokens = estimateTokens(headerText);
  const bodyLines = lines.slice(2);

  const subs: TableSubChunk[] = [];
  let buf = headerText;
  let bufStart = block.charStart;
  let bufTokens = headerTokens;
  let lineOffset = block.charStart + lines.slice(0, 2).join('\n').length + 1;

  for (const line of bodyLines) {
    const lineTokens = estimateTokens(line + '\n');
    if (bufTokens + lineTokens > maxTok && buf.trim() !== headerText.trim()) {
      // Flush current batch.
      subs.push({
        content: cleanChunkContent(buf),
        charStart: bufStart,
        charEnd: lineOffset,
        tokens: bufTokens,
      });
      // Start new batch with repeated header.
      buf = headerText;
      bufStart = lineOffset;
      bufTokens = headerTokens;
    }
    buf += line + '\n';
    bufTokens += lineTokens;
    lineOffset += line.length + 1;
  }
  if (buf.trim() !== headerText.trim()) {
    subs.push({
      content: cleanChunkContent(buf),
      charStart: bufStart,
      charEnd: block.charEnd,
      tokens: bufTokens,
    });
  }
  return subs.length > 0 ? subs : [{ content: cleanChunkContent(text), charStart: block.charStart, charEnd: block.charEnd, tokens: block.tokens }];
}

/** Split an HTML <table> by <tr> rows, repeating <thead> in each sub-chunk. */
function splitHtmlTable(block: Block, maxTok: number): TableSubChunk[] {
  const text = block.text;
  // Extract <thead>...</thead> if present.
  const theadMatch = text.match(/<thead>[\s\S]*?<\/thead>/i);
  const thead = theadMatch ? theadMatch[0] : '';

  // Extract the table open tag + optional thead + body rows.
  const openTagMatch = text.match(/<table[^>]*>/i);
  const openTag = openTagMatch ? openTagMatch[0] : '<table>';

  // Split body by <tr>...</tr>.
  const bodyStart = text.search(/<tbody[\s>]/i) !== -1
    ? text.search(/<tbody[\s>]/i)
    : (theadMatch ? (theadMatch.index ?? 0) + theadMatch[0].length : openTag.length);
  const bodyText = text.slice(bodyStart);
  const rowMatches = [...bodyText.matchAll(/<tr[\s\S]*?<\/tr>/gi)];

  if (rowMatches.length === 0) {
    return [{ content: cleanChunkContent(text), charStart: block.charStart, charEnd: block.charEnd, tokens: block.tokens }];
  }

  const subs: TableSubChunk[] = [];
  let buf = `${openTag}${thead}`;
  let bufStart = block.charStart;
  let bufTokens = estimateTokens(buf);
  let rowOffset = bodyStart;

  for (const rowMatch of rowMatches) {
    const rowText = rowMatch[0];
    const rowTokens = estimateTokens(rowText);
    if (bufTokens + rowTokens > maxTok && buf !== `${openTag}${thead}`) {
      // Flush with closing tag.
      const flushed = buf + '</table>';
      subs.push({
        content: cleanChunkContent(flushed),
        charStart: bufStart,
        charEnd: block.charStart + rowOffset,
        tokens: bufTokens,
      });
      // New batch with repeated header.
      buf = `${openTag}${thead}`;
      bufStart = block.charStart + rowOffset;
      bufTokens = estimateTokens(buf);
    }
    buf += rowText;
    bufTokens += rowTokens;
    rowOffset = rowMatch.index! + rowText.length;
  }
  if (buf !== `${openTag}${thead}`) {
    subs.push({
      content: cleanChunkContent(buf + '</table>'),
      charStart: bufStart,
      charEnd: block.charEnd,
      tokens: bufTokens,
    });
  }
  return subs.length > 0 ? subs : [{ content: cleanChunkContent(text), charStart: block.charStart, charEnd: block.charEnd, tokens: block.tokens }];
}

// ─── peer merging (HybridChunker post-pass) ─────────────────────────────────
//
// Chunks smaller than `minTokens` (64) are merged into the previous chunk
// (if same section) or the next chunk (if same section). Tiny chunks in
// different sections are left alone — merging across section boundaries
// would corrupt the sectionPath metadata.

function mergeTinyPeers(
  chunks: Chunk[],
  o: Required<Pick<ChunkOptions, 'minTokens'>>
): Chunk[] {
  if (chunks.length <= 1) return chunks;
  const out: Chunk[] = [];

  for (const c of chunks) {
    if (c.tokens < o.minTokens && out.length > 0) {
      const prev = out[out.length - 1];
      // Only merge if same sectionPath (don't cross section boundaries).
      if (prev.sectionPath === c.sectionPath) {
        prev.content = prev.content + '\n' + c.content;
        prev.charEnd = c.charEnd;
        prev.tokens = estimateTokens(prev.content);
        // Keep prev's blockType (dominant type stays).
        continue;
      }
    }
    out.push(c);
  }

  // Second pass: if the LAST chunk is tiny and same section as previous, merge back.
  if (out.length > 1) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last.tokens < o.minTokens && prev.sectionPath === last.sectionPath) {
      prev.content = prev.content + '\n' + last.content;
      prev.charEnd = last.charEnd;
      prev.tokens = estimateTokens(prev.content);
      out.pop();
    }
  }

  return out;
}

// ─── section lookup ─────────────────────────────────────────────────────────

function findEnclosingSection(sections: DocSection[], pos: number): DocSection | undefined {
  // Binary search for the last section whose charStart <= pos.
  let lo = 0, hi = sections.length - 1, ans: DocSection | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sections[mid].charStart <= pos) {
      ans = sections[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function findPage(doc: ParsedDocument, pos: number): number | undefined {
  if (!doc.pages || doc.pages.length === 0) return undefined;
  let page = 1;
  for (let i = 0; i < doc.pages.length; i++) {
    if (doc.pages[i] <= pos) page = i + 1;
    else break;
  }
  return page;
}

// ─── chunk content cleaning ─────────────────────────────────────────────────
//
// Strips markdown ATX header markers (#, ##, ###) from the start of lines so
// the chunk content is clean prose for the model. The section title is
// already preserved in the `section` field, so we don't lose structure.
//
// Also collapses runs of whitespace and trims.
function cleanChunkContent(raw: string): string {
  let s = raw;
  // Remove leading `#` markers from each line (but keep the heading text).
  // E.g. "## Methods\nWe analyse..." → "Methods\nWe analyse..."
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
  // Collapse runs of spaces/tabs (but preserve newlines).
  s = s.replace(/[ \t]+/g, ' ');
  // Trim trailing spaces on each line.
  s = s.replace(/ *\n */g, '\n');
  // Collapse 3+ newlines to 2.
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// ─── title-chunk detection ──────────────────────────────────────────────────


// ─── recursive split (LangChain-style) ──────────────────────────────────────

function recursiveSplit(c: Chunk, o: Required<Pick<ChunkOptions, 'targetTokens' | 'overlapTokens' | 'maxTokens' | 'minTokens'>>): Chunk[] {
  const out: Chunk[] = [];
  const text = c.content;
  const separators = ['\n\n', '\n', '. ', '。', '; ', '；', ', ', '，', ' ', ''];
  let pieces = [text];

  // Convert token budget to char budget for splitOn (heuristic: 1 tok ≈ 3 chars mixed).
  const maxChars = o.maxTokens * 3;

  for (const sep of separators) {
    if (pieces.every((p) => p.length <= maxChars)) break;
    pieces = pieces.flatMap((p) =>
      p.length <= maxChars ? [p] : splitOn(p, sep, maxChars)
    );
  }

  // Re-assemble pieces into chunks of ~targetTokens with overlap.
  const targetChars = o.targetTokens * 3;
  const overlapChars = o.overlapTokens * 3;
  let buf = '';
  let bufStart = c.charStart;
  let idx = 0;
  for (const p of pieces) {
    if (buf.length + p.length + 1 > targetChars && buf.length > 0) {
      out.push(makeChunk(buf, c, bufStart, idx++, o));
      // Overlap: keep last `overlapChars` chars of buf.
      const tail = buf.slice(-overlapChars);
      bufStart = c.charStart + (c.content.indexOf(buf) + buf.length - tail.length);
      buf = tail + (tail.endsWith('\n') ? '' : '\n') + p;
    } else {
      buf += (buf && !buf.endsWith('\n') ? '\n' : '') + p;
    }
  }
  if (buf.trim()) out.push(makeChunk(buf, c, bufStart, idx++, o));
  return out;
}

function splitOn(text: string, sep: string, maxLen: number): string[] {
  if (!sep) {
    // Final fallback: hard split by maxLen.
    const out: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) out.push(text.slice(i, i + maxLen));
    return out;
  }
  const parts = text.split(sep);
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < parts.length; i++) {
    const candidate = buf ? buf + sep + parts[i] : parts[i];
    if (candidate.length > maxLen && buf) {
      out.push(buf);
      buf = parts[i];
    } else {
      buf = candidate;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function makeChunk(content: string, parent: Chunk, charStart: number, idx: number, _o: Required<Pick<ChunkOptions, 'targetTokens' | 'overlapTokens' | 'maxTokens' | 'minTokens'>>): Chunk {
  return {
    content: content.trim(),
    section: parent.section,
    chunkIndex: idx,
    charStart,
    charEnd: charStart + content.length,
    tokens: estimateTokens(content),
    metadata: { ...parent.metadata, isTitle: false },
    // v2: inherit from parent split
    blockType: parent.blockType,
    sectionPath: parent.sectionPath,
    page: parent.page,
    bbox: parent.bbox,
    sectionRole: parent.sectionRole,
  };
}

// ─── v2 block-type + section-role heuristic classifiers ─────────────────────
//
// These are deliberately cheap (regex-based) so they run at chunking time
// VLM-emitted types when available (precision='high' mode), falling back to
// these heuristics for fast mode.

/**
 * Classify a chunk into one of the BlockType categories based on its content.
 *
 * Priority order (first match wins):
 *   2. table     — contains HTML <table> or markdown pipe |---| table
 *   3. figure    — contains ![Figure: ...](...) image reference
 *   4. formula   — contains \[...\] display math
 *   5. code      — contains ``` fenced code block
 *   6. reference — starts with [N] bibliography pattern
 *   7. caption   — starts with "Figure N:" / "Table N:" / "图 N" / "表 N"
 *   8. list      — majority of non-empty lines start with - / * / N.
 *   9. text      — default
 */

/**
 * Detect GROBID section role from a section title.
 * Handles both English and Chinese academic paper conventions.
 *
 * Examples that map to each role:
 *   abstract      → "Abstract", "摘要"
 *   introduction  → "1. Introduction", "引言", "绪论"
 *   methods       → "Methods", "Methodology", "方法", "实验设计"
 *   results       → "Results", "Experiments", "结果", "实验结果"
 *   discussion    → "Discussion", "讨论"
 *   conclusion    → "Conclusion", "Conclusions", "结论", "总结"
 *   references     → "References", "Bibliography", "参考文献"
 *   appendix      → "Appendix", "附录"
 */
export function detectSectionRole(title: string): SectionRole | undefined {
  const t = title.toLowerCase().trim();
  // Strip leading numbering like "1." / "3.2" / "第一章"
  const cleaned = t.replace(/^(\d+\.?\d*\.?\s*|第[一二三四五六七八九十百]+章\s*)/, '').trim();

  if (/^abstract|^摘要|^摘\s*要/.test(cleaned)) return 'abstract';
  if (/^introduction|^引言|^绪论|^背景/.test(cleaned)) return 'introduction';
  if (/^method|^methodology|^实验设计|^方法|^模型|^模型设计|^研究方法/.test(cleaned)) return 'methods';
  if (/^result|^experiment|^实验结果|^结果|^评估|^evaluation/.test(cleaned)) return 'results';
  if (/^discussion|^讨论/.test(cleaned)) return 'discussion';
  if (/^conclusion|^conclusions|^结论|^总结/.test(cleaned)) return 'conclusion';
  if (/^reference|^bibliography|^参考文献|^引用文献/.test(cleaned)) return 'references';
  if (/^appendix|^附录/.test(cleaned)) return 'appendix';
  return undefined;
}

// ─── token estimation ───────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const other = text.length - han;
  // CJK ≈ 1 token per 2 chars (clp-like), Latin ≈ 1 token per 4 chars (BPE).
  return Math.ceil(han / 2 + other / 4);
}

// ─── structural outline (for UI display) ────────────────────────────────────

export interface OutlineNode {
  title: string;
  charStart: number;
  charEnd: number;
  level: number;
  children: OutlineNode[];
}

/**
 * Build a hierarchical outline from flat sections. Useful for the UI's
 * "document outline" panel. Sections with no children are leaves.
 */
export function buildOutline(sections: DocSection[]): OutlineNode[] {
  const sorted = [...sections].sort((a, b) => a.charStart - b.charStart);
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const s of sorted) {
    const node: OutlineNode = {
      title: s.title,
      charStart: s.charStart,
      charEnd: s.charEnd,
      level: s.level,
      children: [],
    };
    // Pop stack until we find a parent with strictly smaller level.
    while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root.push(node);
    stack.push(node);
  }
  return root;
}
