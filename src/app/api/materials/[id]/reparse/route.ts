import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chunkDocument, buildOutline } from '@/lib/document-chunker';
import { embed, encodeEmbedding } from '@/lib/text-embedding';
import { buildSemanticIndex, mdToTree } from '@/lib/semantic-index';
import { parsePdfTiered, type PrecisionLevel } from '@/lib/file-parser/pdf-tiered';

// ─── POST /api/materials/[id]/reparse ──────────────────────────────────────
//
// Re-parse an existing material's original bytes with a higher precision
// level. This is the "升级到高精度" button in the UI.
//
// Flow:
//   1. Load material row → we need its original bytes. Since we don't store
//      the raw file (only extracted text), we require the client to re-upload
//      the file via multipart. The material ID specifies which row to update.
//   2. parsePdfTiered({ precision }) → new ParsedDocument
//   3. Re-chunk, re-embed, (optionally) re-enrich
//   4. Delete old chunks, insert new ones, update material row.
//
// Non-PDF files: this endpoint only re-parses PDFs. For DOCX/XLSX/etc the
// original parse is already maximal-quality; re-parsing won't help.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const material = await db.learningMaterial.findUnique({
      where: { id },
      select: { id: true, filename: true, fileType: true, sessionId: true, parser: true },
    });
    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided for reparse' }, { status: 400 });
    }
    const precision = (formData.get('precision') as PrecisionLevel | null) ?? 'high';
    const enrichFlag = formData.get('enrich') as string | null;
    const doEnrich = precision === 'high' ? enrichFlag !== 'false' : enrichFlag === 'true';

    const bytes = await file.arrayBuffer();
    const MAX_CONTENT_CHARS = 200_000;
    const MAX_CHUNKS_PER_FILE = 600;

    // Re-parse with the requested precision.
    const parsed = await parsePdfTiered(bytes, {
      precision,
      maxChars: MAX_CONTENT_CHARS,
    });

    const chunks = parsed.text.trim().length > 0
      ? chunkDocument(parsed).slice(0, MAX_CHUNKS_PER_FILE)
      : [];

    // Semantic enrichment.
    // P2 fix: always build the base semantic tree (no LLM) so tree-walk
    // retrieval works even when enrich is disabled. When enrich=true, the
    // LLM-enriched tree (with summaries) replaces the base tree.
    let semanticMap: Map<number, { keywords: string[]; summary: string }> = new Map();
    let docSummary: import('@/lib/semantic-index').DocumentSummaryNode[] = [];
    let semanticTree: import('@/lib/semantic-index').SemanticTreeNode[] =
      parsed.parser !== 'failed' ? mdToTree(parsed) : [];
    if (doEnrich && chunks.length > 0 && parsed.parser !== 'failed') {
      try {
        const sem = await buildSemanticIndex(parsed, chunks);
        semanticMap = sem.chunks;
        docSummary = sem.summary;
        if (sem.tree.length > 0) semanticTree = sem.tree;
      } catch (err) {
        console.error('[reparse] semantic enrichment failed:', err);
      }
    }

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

    const status = parsed.parser === 'failed' ? 'error' : 'ready';
    const outline = semanticTree.length > 0
      ? semanticTree
      : docSummary.length > 0
        ? docSummary
        : buildOutline(parsed.sections);

    // Atomic update: delete old chunks, update material, create new chunks.
    const updated = await db.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { materialId: id } });
      return tx.learningMaterial.update({
        where: { id },
        data: {
          content: parsed.text,
          charCount: parsed.text.length,
          status,
          parser: parsed.parser,
          pageCount: parsed.metadata.pageCount ?? null,
          language: parsed.metadata.language ?? null,
          outline: outline.length > 0 ? JSON.stringify(outline) : null,
          chunkCount: embeddedChunks.length,
          chunks: { create: embeddedChunks },
        },
        select: {
          id: true, filename: true, fileType: true, size: true, title: true,
          charCount: true, status: true, parser: true, pageCount: true,
          language: true, chunkCount: true, updatedAt: true,
        },
      });
    });

    return NextResponse.json({
      material: updated,
      warnings: parsed.warnings,
      semanticEnriched: semanticMap.size > 0,
    });
  } catch (error) {
    console.error('Reparse material error:', error);
    return NextResponse.json(
      { error: 'Failed to reparse material' },
      { status: 500 }
    );
  }
}
