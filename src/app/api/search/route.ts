import { NextRequest, NextResponse } from 'next/server';
import { globalSearch, type SearchScope } from '@/lib/search-service';

// GET /api/search?q=<query>&limit=<n>&scope=<all|documents|knowledge|messages|sessions>&sessionId=<id>
//
// Unified semantic search across:
//   - documents  → DocumentChunk BM25 + role-boost + CJK + keyword (semantic)
//   - knowledge  → KnowledgeNode lexical + token overlap
//   - sessions   → LearningSession title/topic lexical
//   - messages   → LearningMessage content lexical
//
// Results are fused and ranked by a normalised 0-1 relevance. Document hits
// (semantic) generally rank highest. Pass `scope` to restrict to one source,
// or `sessionId` to restrict to one learning session.
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    const limit = Math.min(
      60,
      Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 24)
    );
    const scopeParam = (req.nextUrl.searchParams.get('scope') || 'all') as SearchScope;
    const sessionId = req.nextUrl.searchParams.get('sessionId') || undefined;

    const validScopes: SearchScope[] = [
      'all',
      'documents',
      'knowledge',
      'messages',
      'sessions',
    ];
    const scope: SearchScope = validScopes.includes(scopeParam) ? scopeParam : 'all';

    if (!q) {
      return NextResponse.json({ results: [], scope, query: '' });
    }

    const results = await globalSearch(q, { limit, scope, sessionId });
    return NextResponse.json({ results, query: q, scope, count: results.length });
  } catch (_err) {
    console.error('[search] error:', _err);
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
