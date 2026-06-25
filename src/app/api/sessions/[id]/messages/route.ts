import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/messages - Get messages for a session
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messages = await db.learningMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// DELETE /api/sessions/[id]/messages - Delete all messages for a session
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.learningMessage.deleteMany({ where: { sessionId: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 });
  }
}

// POST /api/sessions/[id]/messages - Add a message to a session
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { role, content, type, thinking } = await req.json();

    const message = await db.learningMessage.create({
      data: {
        sessionId: id,
        role,
        content,
        type: type || 'dialogue',
        thinking: thinking || null,
      },
    });

    await db.learningSession.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
  }
}
