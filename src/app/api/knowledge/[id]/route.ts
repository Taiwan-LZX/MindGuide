import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/knowledge/[id] - Toggle mastered status
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

    const updated = await db.knowledgeNode.update({
      where: { id },
      data: { mastered: !node.mastered },
    });

    return NextResponse.json({ node: updated });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update knowledge node' }, { status: 500 });
  }
}
