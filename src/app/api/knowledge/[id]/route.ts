import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/knowledge/[id] - Update mastered status and/or importance
//
// Body (all optional — only provided fields are updated):
//   { mastered?: boolean, importance?: number (1-5) }
//
// If no body fields are provided, defaults to toggling mastered (backward
// compatible with the original behavior where the route only toggled).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await db.knowledgeNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: 'Knowledge node not found' }, { status: 404 });
    }

    let body: { mastered?: boolean; importance?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body — fall back to toggle behavior
    }

    const data: { mastered?: boolean; importance?: number } = {};
    if (typeof body.mastered === 'boolean') {
      data.mastered = body.mastered;
    } else if (body.mastered === undefined && body.importance === undefined) {
      // No fields provided — toggle mastered (legacy behavior)
      data.mastered = !node.mastered;
    }
    if (typeof body.importance === 'number' && body.importance >= 1 && body.importance <= 5) {
      data.importance = Math.round(body.importance);
    }

    const updated = await db.knowledgeNode.update({
      where: { id },
      data,
    });

    return NextResponse.json({ node: updated });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update knowledge node' }, { status: 500 });
  }
}
