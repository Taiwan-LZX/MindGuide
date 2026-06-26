import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// DELETE /api/messages/[id] — delete a single message.
// Used by the "regenerate" flow to drop the trailing assistant reply (and the
// user turn that prompted it) so a fresh answer can be streamed in its place.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.learningMessage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}
