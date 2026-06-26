import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/materials/[id]/outline — structural outline of a material
//
// Returns the parsed section hierarchy (title + char range + level) so the UI
// can render a navigable table-of-contents sidebar.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const material = await db.learningMaterial.findUnique({
      where: { id },
      select: { id: true, title: true, filename: true, outline: true, chunkCount: true },
    });
    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    let outline: any[] = [];
    if (material.outline) {
      try { outline = JSON.parse(material.outline); } catch { /* malformed — leave empty */ }
    }

    return NextResponse.json({
      material: {
        id: material.id,
        title: material.title,
        filename: material.filename,
        chunkCount: material.chunkCount,
      },
      outline,
    });
  } catch (error) {
    console.error('Fetch outline error:', error);
    return NextResponse.json({ error: 'Failed to fetch outline' }, { status: 500 });
  }
}
