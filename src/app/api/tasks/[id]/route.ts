import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/tasks/[id] — toggle done / update title / priority
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { done?: boolean; title?: string; priority?: number } = {};
    if (typeof body?.done === 'boolean') data.done = body.done;
    if (typeof body?.title === 'string' && body.title.trim()) data.title = body.title.trim().slice(0, 300);
    if (Number.isFinite(body?.priority)) {
      data.priority = Math.min(5, Math.max(1, Number(body.priority)));
    }
    const task = await db.task.update({
      where: { id },
      data,
    });
    return NextResponse.json({ task });
  } catch (error) {
    console.error('PATCH task error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE task error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
