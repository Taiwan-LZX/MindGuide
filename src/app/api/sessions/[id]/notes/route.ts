import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/notes — fetch notes for a session (returns empty content if not exist)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let note = await db.note.findUnique({ where: { sessionId: id } });
    if (!note) {
      // Auto-create empty note on first access to simplify upserts later
      note = await db.note.create({
        data: { sessionId: id, content: '' },
      });
    }
    return NextResponse.json({ note });
  } catch (error) {
    console.error('GET notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

// PUT /api/sessions/[id]/notes — upsert notes content (auto-save)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { content } = await req.json();

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
    }

    // Truncate extremely large notes to prevent abuse (1MB max)
    const safeContent = content.slice(0, 1_000_000);

    const note = await db.note.upsert({
      where: { sessionId: id },
      update: { content: safeContent },
      create: { sessionId: id, content: safeContent },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error('PUT notes error:', error);
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
  }
}
