import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/cards/[id] — toggle mastered / update fields
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { mastered?: boolean; front?: string; back?: string; category?: string } = {};
    if (typeof body?.mastered === 'boolean') data.mastered = body.mastered;
    if (typeof body?.front === 'string' && body.front.trim()) data.front = body.front.trim();
    if (typeof body?.back === 'string' && body.back.trim()) data.back = body.back.trim();
    if (typeof body?.category === 'string' && body.category.trim()) data.category = body.category.trim().slice(0, 60);
    const card = await db.card.update({
      where: { id },
      data,
    });
    return NextResponse.json({ card });
  } catch (error) {
    console.error('PATCH card error:', error);
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 });
  }
}

// DELETE /api/cards/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.card.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE card error:', error);
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 });
  }
}
