import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/search?q=<query>&limit=<n>
// Searches across sessions (title/topic) and messages (content).
// Returns up to `limit` (default 20) results, each tagged with a category:
//   - "chat"   → a message whose content matched (links to its session)
//   - "lesson" → a session whose title/topic matched
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    const limit = Math.min(40, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 20));
    if (!q) {
      return NextResponse.json({ results: [] });
    }

    // 1) Sessions whose title or topic matches.
    const matchedSessions = await db.learningSession.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { topic: { contains: q } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    type Result = {
      id: string;
      category: 'chat' | 'lesson';
      title: string;
      subtitle: string;
      timestamp: string;
      sessionId?: string;
    };
    const results: Result[] = [];

    for (const s of matchedSessions) {
      results.push({
        id: `sess-${s.id}`,
        category: 'lesson',
        title: s.title,
        subtitle: (s.topic || s.description || '学习主题'),
        timestamp: s.updatedAt.toISOString(),
        sessionId: s.id,
      });
    }

    // 2) Messages whose content matches (only if we still have room).
    if (results.length < limit) {
      const matchedMessages = await db.learningMessage.findMany({
        where: {
          content: { contains: q },
        },
        orderBy: { createdAt: 'desc' },
        take: limit - results.length,
        include: { session: true },
      });
      for (const m of matchedMessages) {
        // Truncate the matching content for a preview.
        const content = (m.content || '').replace(/\s+/g, ' ').trim();
        const idx = content.toLowerCase().indexOf(q.toLowerCase());
        const start = Math.max(0, idx - 24);
        const preview = (start > 0 ? '…' : '') + content.slice(start, start + 80) + (content.length > start + 80 ? '…' : '');
        results.push({
          id: `msg-${m.id}`,
          category: 'chat',
          title: m.session?.title || '对话',
          subtitle: preview,
          timestamp: m.createdAt.toISOString(),
          sessionId: m.sessionId,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('search error:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}
