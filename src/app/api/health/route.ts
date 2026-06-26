import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/health — liveness + readiness probe.
//
// A plain `HEAD /` returns 200 even when the SQLite file descriptor held by
// the long-running dev server has gone stale (e.g. after the db file is
// replaced on disk via git checkout / db:push). In that state every WRITE
// fails with SQLite error 1032 ("attempt to write a readonly database") while
// reads still succeed — so the watchdog's HTTP-only health check never fires
// and the app silently 500s on every POST/PATCH/DELETE.
//
// This endpoint performs a real write probe: a no-op UPDATE that touches no
// data but requires write access. If it throws, we return 500 so the watchdog
// restarts the server and Prisma re-opens the db file.
export async function GET() {
  try {
    // Harmless write: bump updatedAt on the most-recent session without
    // changing any field values. If the fd is stale this throws.
    await db.$executeRaw`
      UPDATE LearningSession
      SET updatedAt = updatedAt
      WHERE id = (SELECT id FROM LearningSession ORDER BY updatedAt DESC LIMIT 1)
    `;
    return NextResponse.json({ status: 'ok', db: 'writable' });
  } catch (error) {
    console.error('[/api/health] DB write probe failed:', error);
    return NextResponse.json(
      { status: 'degraded', db: 'readonly-or-error' },
      { status: 500 }
    );
  }
}
