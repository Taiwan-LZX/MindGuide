import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/cards/review
// Returns the SM-2 review queue for this session: cards whose `dueAt` has
// passed, plus never-reviewed cards (dueAt === null). Cards are shuffled so
// the learner doesn't see them in the same order every session.
//
// Query params:
//   ?limit=20  — cap queue length (default 20, max 100)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const now = new Date();

    // Due = (dueAt is null) OR (dueAt <= now)
    const dueCards = await db.card.findMany({
      where: {
        sessionId: id,
        OR: [
          { dueAt: null },
          { dueAt: { lte: now } },
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: limit * 2, // grab more than needed, then shuffle
    });

    // Fisher–Yates shuffle so the session order is non-deterministic.
    for (let i = dueCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dueCards[i], dueCards[j]] = [dueCards[j], dueCards[i]];
    }

    const queue = dueCards.slice(0, limit);
    return NextResponse.json({
      queue,
      total: queue.length,
      now: now.toISOString(),
    });
  } catch (error) {
    console.error('GET review queue error:', error);
    return NextResponse.json({ error: 'Failed to fetch review queue' }, { status: 500 });
  }
}
