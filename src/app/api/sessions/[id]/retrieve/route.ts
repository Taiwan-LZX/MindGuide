import { NextRequest, NextResponse } from 'next/server';
import { retrievePassages, buildKnowledgeBaseContext } from '@/lib/retrieval';
import { parseBody, retrieveSchema } from '@/lib/api-validator';

// POST /api/sessions/[id]/retrieve — RAG retrieval over a session's knowledge base
//
// Body: { query: string, topK?: number }
// Returns: { passages: RetrievedPassage[], context: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseBody(req, retrieveSchema);
    if (!parsed.ok) return parsed.response;
    const { query, topK } = parsed.data;

    const passages = await retrievePassages(id, query, topK);
    const context = buildKnowledgeBaseContext(passages);

    return NextResponse.json({
      sessionId: id,
      query,
      passageCount: passages.length,
      passages,
      context,
    });
  } catch (error) {
    console.error('Retrieve error:', error);
    return NextResponse.json({ error: 'Failed to retrieve passages' }, { status: 500 });
  }
}
