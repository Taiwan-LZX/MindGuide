import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/sessions/[id]/course — fetch persisted course modules + lessons for a session
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const modules = await db.courseModule.findMany({
      where: { sessionId: id },
      include: { lessons: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json({ modules });
  } catch (error) {
    console.error('GET course error:', error);
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 });
  }
}

// PUT /api/sessions/[id]/course — replace the entire course (used after AI generates new modules)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const modules = Array.isArray(body?.modules) ? body.modules : null;
    if (!modules) {
      return NextResponse.json({ error: 'modules array is required' }, { status: 400 });
    }

    // Validate & normalize each module/lesson
    const normalized = modules.map((m: any, mi: number) => ({
      title: String(m?.title || `模块 ${mi + 1}`).slice(0, 200),
      order: Number.isFinite(m?.order) ? m.order : mi,
      lessons: Array.isArray(m?.lessons) ? m.lessons.map((l: any, li: number) => ({
        title: String(l?.title || `课时 ${li + 1}`).slice(0, 200),
        type: ['theory', 'practice', 'quiz'].includes(l?.type) ? l.type : 'theory',
        duration: String(l?.duration || '10分钟').slice(0, 20),
        status: ['locked', 'available', 'active', 'completed'].includes(l?.status) ? l.status : 'locked',
        content: String(l?.content || '').slice(0, 5000),
        order: Number.isFinite(l?.order) ? l.order : li,
      })) : [],
    }));

    // Atomically replace existing course
    await db.$transaction([
      db.courseLesson.deleteMany({
        where: { module: { sessionId: id } },
      }),
      db.courseModule.deleteMany({ where: { sessionId: id } }),
    ]);

    for (const m of normalized) {
      const createdModule = await db.courseModule.create({
        data: {
          sessionId: id,
          title: m.title,
          order: m.order,
        },
      });
      for (const l of m.lessons) {
        await db.courseLesson.create({
          data: {
            moduleId: createdModule.id,
            title: l.title,
            type: l.type,
            duration: l.duration,
            status: l.status,
            content: l.content,
            order: l.order,
          },
        });
      }
    }

    const freshModules = await db.courseModule.findMany({
      where: { sessionId: id },
      include: { lessons: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ modules: freshModules });
  } catch (error) {
    console.error('PUT course error:', error);
    return NextResponse.json({ error: 'Failed to save course' }, { status: 500 });
  }
}

// PATCH /api/sessions/[id]/course — update a single lesson's status (progress tracking)
// Body: { lessonId, status }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { lessonId, status } = await req.json();

    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId is required' }, { status: 400 });
    }
    if (!['locked', 'available', 'active', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Make sure the lesson belongs to this session
    const lesson = await db.courseLesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson || lesson.module.sessionId !== id) {
      return NextResponse.json({ error: 'Lesson not found in this session' }, { status: 404 });
    }

    const updated = await db.courseLesson.update({
      where: { id: lessonId },
      data: { status },
    });

    return NextResponse.json({ lesson: updated });
  } catch (error) {
    console.error('PATCH course error:', error);
    return NextResponse.json({ error: 'Failed to update lesson status' }, { status: 500 });
  }
}
