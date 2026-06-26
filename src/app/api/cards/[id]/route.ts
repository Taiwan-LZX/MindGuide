import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sm2Next } from '@/lib/sm2';

// PATCH /api/cards/[id] — toggle mastered / update fields / record SM-2 review
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: {
      mastered?: boolean;
      front?: string;
      back?: string;
      category?: string;
      ease?: number;
      interval?: number;
      repetition?: number;
      dueAt?: Date;
      lastReviewedAt?: Date;
    } = {};
    if (typeof body?.mastered === 'boolean') data.mastered = body.mastered;
    if (typeof body?.front === 'string' && body.front.trim()) data.front = body.front.trim();
    if (typeof body?.back === 'string' && body.back.trim()) data.back = body.back.trim();
    if (typeof body?.category === 'string' && body.category.trim()) data.category = body.category.trim().slice(0, 60);

    // SM-2 review submission: body = { review: { quality: 0|2|4|5 } }
    // Computes the next spaced-repetition state from the card's current state.
    if (body?.review && typeof body.review.quality === 'number') {
      const card = await db.card.findUnique({ where: { id } });
      if (!card) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 });
      }
      const quality = Math.max(0, Math.min(5, Math.floor(body.review.quality))) as 0 | 1 | 2 | 3 | 4 | 5;
      const next = sm2Next(
        { ease: card.ease, interval: card.interval, repetition: card.repetition },
        quality,
        new Date()
      );
      data.ease = next.ease;
      data.interval = next.interval;
      data.repetition = next.repetition;
      data.dueAt = next.dueAt;
      data.lastReviewedAt = next.lastReviewedAt;
      // Auto-mark as mastered once the card has a comfortable interval (≥ 21 days)
      // and the learner keeps recalling it. They can still un-mark manually.
      if (next.interval >= 21 && !card.mastered) {
        data.mastered = true;
      }
      const updated = await db.card.update({ where: { id }, data });
      return NextResponse.json({
        card: updated,
        review: {
          quality,
          ease: next.ease,
          interval: next.interval,
          repetition: next.repetition,
          dueAt: next.dueAt,
          lastReviewedAt: next.lastReviewedAt,
          // Quality bucket label for client display
          bucket: quality < 3 ? 'forgot' : quality === 4 ? 'good' : quality >= 5 ? 'easy' : 'hard',
        },
      });
    }

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

