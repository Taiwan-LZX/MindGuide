import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseFile } from '@/lib/file-parser';
import type { PrecisionLevel } from '@/lib/file-parser/pdf-tiered';
import { chunkDocument, buildOutline } from '@/lib/document-chunker';
import { embed, encodeEmbedding } from '@/lib/text-embedding';
import { buildSemanticIndex, mdToTree } from '@/lib/semantic-index';
import type { DocumentSummaryNode, SemanticTreeNode } from '@/lib/semantic-index';

// ─── Upload pipeline (v2 — high-precision tiered parsing) ──────────────────
//
// For each uploaded file:
//   1. parseFile({ precision })   — tiered parse:
//        fast   → unpdf/mammoth/xlsx (instant)
//        medium → + MuPDF structured text fallback for sparse PDFs
//        high   → + VLM page rendering for scanned/complex PDFs
//   2. chunkDocument()            — split into ~800-char retrieval units
//   3. buildSemanticIndex()       — (precision='high' only) LLM per-chunk
//        keywords + document summary tree, folded into chunk metadata
//   4. embed() + persist          — BM25 embedding + DB rows
//
// Size guard: 25 MB per file. 200k char cap on extracted text. 600 chunk cap.

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_CONTENT_CHARS = 200_000;       // hard cap on extracted text
const MAX_CHUNKS_PER_FILE = 600;         // safety cap

// ─── GET — list materials for a session ────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const materials = await db.learningMaterial.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        filename: true,
        fileType: true,
        size: true,
        title: true,
        charCount: true,
        status: true,
        parser: true,
        pageCount: true,
        language: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
        // NOTE: `content` and `outline` deliberately omitted — list view
        // doesn't need them. The chunk viewer fetches them on demand.
      },
    });
    return NextResponse.json({ materials });
  } catch (error) {
    console.error('Fetch materials error:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}

// ─── POST — upload one or more files (multipart/form-data) ─────────────────
//
// Optional form fields:
//   - precision: 'fast' | 'medium' | 'high'  (default 'fast')
//       Applies to PDF files only. Non-PDF files ignore this.
//   - enrich: 'true' | 'false'  (default 'false' unless precision='high')
//       When true, runs LLM semantic enrichment (per-chunk keywords + doc summary).
//       Auto-enabled when precision='high'.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify session exists.
    const session = await db.learningSession.findUnique({ where: { id }, select: { id: true } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files');
    const precision = (formData.get('precision') as PrecisionLevel | null) ?? 'fast';
    const enrichFlag = formData.get('enrich') as string | null;
    // Auto-enable enrichment for high precision; otherwise respect explicit flag.
    const doEnrich = precision === 'high' ? enrichFlag !== 'false' : enrichFlag === 'true';

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const created: Array<Record<string, unknown>> = [];
    for (const entry of files) {
      if (!(entry instanceof File)) continue;

      if (entry.size > MAX_FILE_BYTES) {
        created.push({
          id: null,
          filename: entry.name,
          status: 'error',
          error: `文件超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限`,
        });
        continue;
      }

      const bytes = await entry.arrayBuffer();

      // 1. Parse (with precision routing for PDFs).
      const parsed = await parseFile(bytes, entry.name, entry.type, {
        maxChars: MAX_CONTENT_CHARS,
        precision,
      });

      // 2. Chunk (only if parsing produced text).
      const chunks = parsed.text.trim().length > 0
        ? chunkDocument(parsed).slice(0, MAX_CHUNKS_PER_FILE)
        : [];

      // 3. Semantic enrichment (optional — LLM call, slow but boosts recall).
      //    Run before embedding so we can fold keywords into chunk metadata.
      //
      //    P2 fix: ALWAYS build the base semantic tree (mdToTree — pure
      //    structure, no LLM) so tree-walk retrieval works even when enrich
      //    is disabled. When enrich=true, additionally run LLM enrichment
      //    (per-chunk keywords + doc summary + tree summaries) and prefer the
      //    enriched tree (has summaries) over the base tree.
      let semanticMap: Map<number, { keywords: string[]; summary: string }> = new Map();
      let docSummary: DocumentSummaryNode[] = [];
      let semanticTree: SemanticTreeNode[] =
        parsed.parser !== 'failed' ? mdToTree(parsed) : [];
      if (doEnrich && chunks.length > 0 && parsed.parser !== 'failed') {
        try {
          const sem = await buildSemanticIndex(parsed, chunks);
          semanticMap = sem.chunks;
          docSummary = sem.summary;
          // Prefer the enriched tree (has LLM summaries) over the base tree.
          if (sem.tree.length > 0) semanticTree = sem.tree;
        } catch (err) {
          console.error('[materials] semantic enrichment failed:', err);
          // Non-fatal — continue with the base tree (no summaries).
        }
      }

      // 4. Embed each chunk + fold in semantic keywords/summary to metadata.
      //    v2: also persist blockType / sectionPath / page / bbox / sectionRole.
      const embeddedChunks = chunks.map((c) => {
        const sem = semanticMap.get(c.chunkIndex);
        const metaWithSem = {
          ...c.metadata,
          keywords: sem?.keywords ?? [],
          summary: sem?.summary ?? '',
        };
        return {
          content: c.content,
          section: c.section,
          chunkIndex: c.chunkIndex,
          charStart: c.charStart,
          charEnd: c.charEnd,
          tokens: c.tokens,
          embedding: encodeEmbedding(embed(c.content)),
          metadata: JSON.stringify(metaWithSem),
          // v2 fields:
          blockType: c.blockType,
          sectionPath: c.sectionPath,
          page: c.page ?? null,
          bbox: c.bbox ? JSON.stringify(c.bbox) : null,
          sectionRole: c.sectionRole ?? null,
        };
      });

      // 5. Persist material + chunks atomically.
      const status = parsed.parser === 'failed' ? 'error' : 'ready';
      // Outline storage priority: semantic tree (P2, richest) > doc summary > flat outline.
      const outline = semanticTree.length > 0
        ? semanticTree
        : docSummary.length > 0
          ? docSummary
          : buildOutline(parsed.sections);
      const material = await db.learningMaterial.create({
        data: {
          sessionId: id,
          filename: entry.name.slice(0, 255),
          fileType: entry.type || 'application/octet-stream',
          size: entry.size,
          title: entry.name.replace(/\.[^.]+$/, '').slice(0, 200) || entry.name.slice(0, 200),
          content: parsed.text,
          charCount: parsed.text.length,
          status,
          parser: parsed.parser,
          pageCount: parsed.metadata.pageCount ?? null,
          language: parsed.metadata.language ?? null,
          outline: outline.length > 0 ? JSON.stringify(outline) : null,
          chunkCount: embeddedChunks.length,
          chunks: {
            create: embeddedChunks,
          },
        },
        select: {
          id: true, sessionId: true, filename: true, fileType: true,
          size: true, title: true, charCount: true, status: true,
          parser: true, pageCount: true, language: true, chunkCount: true,
          createdAt: true, updatedAt: true,
        },
      });

      created.push({
        ...material,
        warnings: parsed.warnings,
        semanticEnriched: semanticMap.size > 0,
      });
    }

    return NextResponse.json({ materials: created });
  } catch (error) {
    console.error('Upload materials error:', error);
    return NextResponse.json({ error: 'Failed to upload materials' }, { status: 500 });
  }
}

// ─── DELETE — remove all materials for a session (bulk clear) ──────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // DocumentChunk rows cascade-delete with their parent material.
    await db.learningMaterial.deleteMany({ where: { sessionId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete materials error:', error);
    return NextResponse.json({ error: 'Failed to delete materials' }, { status: 500 });
  }
}
