import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/materials/[id] — fetch a single material (including content + outline)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const material = await db.learningMaterial.findUnique({
      where: { id },
      select: {
        id: true, sessionId: true, filename: true, fileType: true,
        size: true, title: true, content: true, charCount: true, status: true,
        parser: true, pageCount: true, language: true, outline: true,
        chunkCount: true, createdAt: true, updatedAt: true,
      },
    });
    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    return NextResponse.json({ material });
  } catch (error) {
    console.error('Fetch material error:', error);
    return NextResponse.json({ error: 'Failed to fetch material' }, { status: 500 });
  }
}

// PATCH /api/materials/[id] — update title (learner-editable display name)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : undefined;

    const updated = await db.learningMaterial.update({
      where: { id },
      data: title !== undefined ? { title } : {},
      select: {
        id: true, sessionId: true, filename: true, fileType: true,
        size: true, title: true, charCount: true, status: true,
        parser: true, pageCount: true, language: true, chunkCount: true,
        createdAt: true, updatedAt: true,
      },
    });
    return NextResponse.json({ material: updated });
  } catch (error) {
    console.error('Update material error:', error);
    return NextResponse.json({ error: 'Failed to update material' }, { status: 500 });
  }
}

// DELETE /api/materials/[id] — delete a single material (cascades to chunks)

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.learningMaterial.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete material error:', error);
    return NextResponse.json({ error: 'Failed to delete material' }, { status: 500 });
  }
}
