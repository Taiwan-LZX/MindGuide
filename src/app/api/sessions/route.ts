import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions - List all sessions
export async function GET() {
  try {
    const sessions = await db.learningSession.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/sessions - Create a new session
export async function POST(req: NextRequest) {
  try {
    const { title, topic, description } = await req.json();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const session = await db.learningSession.create({
      data: {
        title: title.slice(0, 100),
        topic: topic || null,
        description: description || null,
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
