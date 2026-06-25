import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/references - Get references for a session
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const references = await db.reference.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ references });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch references' }, { status: 500 });
  }
}

// POST /api/sessions/[id]/references - Create references
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { references } = await req.json();

    if (!Array.isArray(references)) {
      return NextResponse.json({ error: 'references array is required' }, { status: 400 });
    }

    const created = await Promise.all(
      references.map((ref: { title: string; url?: string; type?: string; note?: string }) =>
        db.reference.create({
          data: {
            sessionId: id,
            title: ref.title,
            url: ref.url || null,
            type: ref.type || 'article',
            note: ref.note || null,
          },
        })
      )
    );

    return NextResponse.json({ references: created });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create references' }, { status: 500 });
  }
}
