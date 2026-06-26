import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/materials/[id]/chunks — paginated chunk viewer
//
// Query params:
//   page    — 1-based page number (default 1)
//   pageSize— chunks per page (default 20, max 100)
//   search  — optional substring filter on chunk content (case-insensitive)
//
// Returns chunks with their section title, char range, and approximate token
// count. Embeddings are deliberately omitted (they're 4 KB each and only
// useful for retrieval, which has its own endpoint).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
    const search = url.searchParams.get('search')?.trim() || '';

    // Verify material exists.
    const material = await db.learningMaterial.findUnique({
      where: { id },
      select: { id: true, title: true, filename: true, chunkCount: true },
    });
    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    const where = search
      ? { materialId: id, content: { contains: search } }
      : { materialId: id };

    const [total, rows] = await Promise.all([
      db.documentChunk.count({ where }),
      db.documentChunk.findMany({
        where,
        orderBy: { chunkIndex: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          chunkIndex: true,
          content: true,
          section: true,
          charStart: true,
          charEnd: true,
          tokens: true,
          metadata: true,
          // v2 fields (P1):
          blockType: true,
          sectionPath: true,
          page: true,
          bbox: true,
          sectionRole: true,
        },
      }),
    ]);

    return NextResponse.json({
      material,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      chunks: rows,
    });
  } catch (error) {
    console.error('Fetch chunks error:', error);
    return NextResponse.json({ error: 'Failed to fetch chunks' }, { status: 500 });
  }
}
