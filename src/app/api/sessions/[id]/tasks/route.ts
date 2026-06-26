import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/tasks — list tasks for a session
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tasks = await db.task.findMany({
      where: { sessionId: id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('GET tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/sessions/[id]/tasks — create a new task
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    const priority = Number.isFinite(body?.priority) ? Number(body.priority) : 3;
    // Append at the end of the current list
    const count = await db.task.count({ where: { sessionId: id } });
    const task = await db.task.create({
      data: {
        sessionId: id,
        title,
        priority: Math.min(5, Math.max(1, priority)),
        order: count,
      },
    });
    return NextResponse.json({ task });
  } catch (error) {
    console.error('POST task error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
