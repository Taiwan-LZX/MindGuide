import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/cards — list cards for a session
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cards = await db.card.findMany({
      where: { sessionId: id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ cards });
  } catch (error) {
    console.error('GET cards error:', error);
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 });
  }
}

// POST /api/sessions/[id]/cards — create a new card
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const front = typeof body?.front === 'string' ? body.front.trim() : '';
    const back = typeof body?.back === 'string' ? body.back.trim() : '';
    if (!front || !back) {
      return NextResponse.json({ error: 'front and back are required' }, { status: 400 });
    }
    const category = typeof body?.category === 'string' && body.category.trim()
      ? body.category.trim().slice(0, 60)
      : 'general';
    const count = await db.card.count({ where: { sessionId: id } });
    const card = await db.card.create({
      data: {
        sessionId: id,
        front,
        back,
        category,
        order: count,
      },
    });
    return NextResponse.json({ card });
  } catch (error) {
    console.error('POST card error:', error);
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 });
  }
}
