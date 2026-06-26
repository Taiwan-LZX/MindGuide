import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseBody, createSessionSchema } from '@/lib/api-validator';

// GET /api/sessions - List all sessions
export async function GET() {
  try {
    const sessions = await db.learningSession.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ sessions });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/sessions - Create a new session
export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, createSessionSchema);
    if (!parsed.ok) return parsed.response;
    const { title, topic, description } = parsed.data;

    const session = await db.learningSession.create({
      data: {
        title,
        topic: topic ?? null,
        description: description ?? null,
      },
    });

    return NextResponse.json({ session });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
