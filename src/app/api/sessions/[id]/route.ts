import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id] - Get single session
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.learningSession.findUnique({
      where: { id },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

// PATCH /api/sessions/[id] - Update session
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { title, status, description } = await req.json();

    // Validate inputs
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) {
      const trimmed = String(title).trim().slice(0, 100);
      if (!trimmed) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      updateData.title = trimmed;
    }
    if (status !== undefined) {
      const validStatuses = ['active', 'paused', 'completed', 'archived'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updateData.status = status;
    }
    if (description !== undefined) {
      updateData.description = String(description).slice(0, 500) || null;
    }

    const session = await db.learningSession.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

// DELETE /api/sessions/[id] - Delete session (idempotent)
// A delete on an already-deleted (or never-existed) session returns 200
// because the desired end-state — "session does not exist" — is already true.
// This prevents retry storms where the UI keeps firing DELETE on a stale id.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.learningSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // Prisma P2025: record not found — treat as already-deleted (idempotent success)
    const code = (error as { code?: string })?.code;
    if (code === 'P2025') {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }
    // Real failure — surface the message so it's diagnosable in dev.log
    console.error('[DELETE /api/sessions/[id]]', code, error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
