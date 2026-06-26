// ────────────────────────────────────────────────────────────────────────────
// api-validator.ts — shared zod schemas + parse helper for API routes
//
// Why: every POST route previously did `await req.json()` and destructured
// blindly, which means malformed JSON / missing fields / wrong types would
// surface as a 500 with a generic "Failed to ..." message. This module gives
// each route a single-line validated parse that returns a 400 with a clear
// error list on bad input.
// ────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { z, type ZodSchema } from 'zod';

/** Parse a Request body against a zod schema. On failure returns a 400
 *  NextResponse (caller must check for it). On success returns the typed data. */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid JSON body', details: 'Request body is not valid JSON.' },
        { status: 400 }
      ),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: result.data };
}

// ── Shared schemas ──────────────────────────────────────────────────────────

export const chatSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(20_000),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        type: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  knowledgeNodes: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
        category: z.string().optional(),
        mastered: z.boolean(),
      })
    )
    .optional()
    .default([]),
  teachingMode: z.enum(['guide', 'explain', 'practice', 'review']).optional().default('guide'),
  thinkingMode: z.enum(['off', 'standard', 'deep', 'structured']).optional().default('standard'),
  selectedModel: z.enum(['GLM-4.6', 'GLM-4.5', 'GLM-4-Air']).optional().default('GLM-4.6'),
});

export const createSessionSchema = z.object({
  title: z.string().min(1).max(100),
  topic: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const cardReviewSchema = z.object({
  cardId: z.string().min(1),
  quality: z.number().int().min(0).max(5),
});

export const createMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string().min(1).max(20_000),
  type: z.string().optional().default('dialogue'),
  thinking: z.string().optional().nullable(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  priority: z.number().int().min(1).max(5).optional().default(3),
  order: z.number().int().optional().default(0),
});

export const createCardSchema = z.object({
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(4000),
  category: z.string().max(100).optional().default('general'),
});

export const createKnowledgeNodeSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10_000),
  category: z.string().max(100).optional(),
  importance: z.number().int().min(1).max(5).optional().default(3),
  tags: z.string().max(500).optional(),
});

export const updateKnowledgeNodeSchema = z.object({
  mastered: z.boolean().optional(),
  importance: z.number().int().min(1).max(5).optional(),
});

export const retrieveSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(20).optional().default(6),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  done: z.boolean().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  order: z.number().int().optional(),
});

export const saveNotesSchema = z.object({
  content: z.string().max(500_000),
});
