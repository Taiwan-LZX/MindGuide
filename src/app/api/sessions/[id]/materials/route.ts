import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── Text extraction ───────────────────────────────────────────────────────
//
// We extract plain text from uploaded files in-process. For text-like formats
// (txt, md, markdown, csv, json, code, log) we decode the bytes directly. For
// everything else (PDF, docx, images, binaries) we store metadata only and
// mark content as empty — a future iteration can add server-side parsing
// (pdf-parse, mammoth, tesseract) but for v1 we keep the dependency surface
// minimal and let the learner paste text or import text files.

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'log', 'rtf',
  'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'swift', 'kt', 'scala',
  'sh', 'bash', 'zsh', 'ps1', 'sql', 'graphql', 'proto',
]);

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/javascript', 'application/x-yaml'];

const MAX_CONTENT_CHARS = 50_000; // ~50k chars cap to keep DB rows + LLM context manageable

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

function isTextLike(filename: string, mimeType: string): boolean {
  if (TEXT_EXTENSIONS.has(getExtension(filename))) return true;
  return TEXT_MIME_PREFIXES.some(p => mimeType.startsWith(p));
}

function extractText(bytes: ArrayBuffer, filename: string, mimeType: string): string {
  if (!isTextLike(filename, mimeType)) return '';
  try {
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Strip HTML tags if it looks like HTML — gives the LLM clean prose
    if (getExtension(filename) === 'html' || mimeType.includes('html')) {
      return raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_CONTENT_CHARS);
    }
    return raw.slice(0, MAX_CONTENT_CHARS);
  } catch {
    // Decode failed (malformed UTF-8 in a text-labelled file) — return empty
    // rather than crashing the upload. The file is still stored as metadata.
    return '';
  }
}

// ─── GET — list materials for a session ────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const materials = await db.learningMaterial.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        filename: true,
        fileType: true,
        size: true,
        title: true,
        charCount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // NOTE: `content` deliberately omitted — list view doesn't need the
        // (potentially large) extracted text. The course generator fetches
        // content separately via the [matId] GET route.
      },
    });
    return NextResponse.json({ materials });
  } catch (error) {
    console.error('Fetch materials error:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}

// ─── POST — upload one or more files (multipart/form-data) ─────────────────
//
// Accepts multipart/form-data with a `files` field (one or more File entries).
// Each file is read into memory, text-extracted, and persisted as a
// LearningMaterial row. Returns the created materials (without content).
//
// Size guard: 5 MB per file (generous for text notes; prevents memory pressure
// from large PDFs that we can't parse anyway).

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify session exists (returns 404 cleanly if not)
    const session = await db.learningSession.findUnique({ where: { id }, select: { id: true } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files');

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const created = [];
    for (const entry of files) {
      if (!(entry instanceof File)) continue;

      if (entry.size > MAX_FILE_BYTES) {
        // Skip oversized files rather than failing the whole batch — the
        // learner gets feedback via the returned status field.
        created.push({
          id: null,
          filename: entry.name,
          status: 'error',
          error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024}MB limit`,
        });
        continue;
      }

      const bytes = await entry.arrayBuffer();
      const content = extractText(bytes, entry.name, entry.type);

      const material = await db.learningMaterial.create({
        data: {
          sessionId: id,
          filename: entry.name.slice(0, 255),
          fileType: entry.type || 'application/octet-stream',
          size: entry.size,
          title: entry.name.replace(/\.[^.]+$/, '').slice(0, 200) || entry.name.slice(0, 200),
          content,
          charCount: content.length,
          status: 'ready',
        },
        select: {
          id: true, sessionId: true, filename: true, fileType: true,
          size: true, title: true, charCount: true, status: true,
          createdAt: true, updatedAt: true,
        },
      });
      created.push(material);
    }

    return NextResponse.json({ materials: created });
  } catch (error) {
    console.error('Upload materials error:', error);
    return NextResponse.json({ error: 'Failed to upload materials' }, { status: 500 });
  }
}

// ─── DELETE — remove all materials for a session (bulk clear) ──────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.learningMaterial.deleteMany({ where: { sessionId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete materials error:', error);
    return NextResponse.json({ error: 'Failed to delete materials' }, { status: 500 });
  }
}
