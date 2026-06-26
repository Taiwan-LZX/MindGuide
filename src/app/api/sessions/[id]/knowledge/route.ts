import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/knowledge - Get knowledge nodes for a session
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodes = await db.knowledgeNode.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ nodes });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch knowledge nodes' }, { status: 500 });
  }
}

// POST /api/sessions/[id]/knowledge - Create knowledge nodes
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { nodes } = await req.json();

    if (!Array.isArray(nodes)) {
      return NextResponse.json({ error: 'nodes array is required' }, { status: 400 });
    }

    const created = await Promise.all(
      nodes.map((node: { title: string; content: string; category?: string; importance?: number; tags?: string }) =>
        db.knowledgeNode.create({
          data: {
            sessionId: id,
            title: node.title,
            content: node.content,
            category: node.category || null,
            importance: node.importance || 3,
            tags: node.tags || null,
          },
        })
      )
    );

    return NextResponse.json({ nodes: created });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create knowledge nodes' }, { status: 500 });
  }
}
