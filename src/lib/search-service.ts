// ────────────────────────────────────────────────────────────────────────────
// search-service.ts — global semantic search across documents, knowledge,
// sessions, and messages. Powers the UnifiedSearch dropdown.
//
// Reuses the same BM25 + role-boost + CJK + keyword pipeline as
// retrievePassages() (via retrieval-boosts.ts), but operates across ALL
// sessions (or a filtered subset) and returns a unified ranked hit list with
// snippets + source attribution.
//
// Sources (run in parallel):
//   1. documents  — DocumentChunk semantic search (BM25 cosine + boosts)
//   2. knowledge  — KnowledgeNode lexical + token-overlap search
//   3. sessions   — LearningSession title/topic/description lexical
//   4. messages   — LearningMessage content lexical
//
// Results are fused and sorted by a normalized `relevance` (0-1) so hits from
// different sources can be interleaved meaningfully. Document hits (semantic)
// generally rank highest because BM25+boost scores exceed lexical match scores.
// ────────────────────────────────────────────────────────────────────────────

import { db } from './db';
import {
  retrieve,
  decodeEmbedding,
  type RetrievableChunk,
  type ScoredChunk,
} from './text-embedding';
import {
  applyRoleBoosts,
  applyLexicalBoosts,
  buildSnippet,
  type ChunkV2Fields,
} from './retrieval-boosts';

export type SearchCategory = 'document' | 'knowledge' | 'chat' | 'lesson';
export type SearchScope = 'all' | 'documents' | 'knowledge' | 'messages' | 'sessions';

export interface SearchHit {
  id: string;
  category: SearchCategory;
  title: string;
  snippet: string;
  /** Normalised 0-1 relevance for display + fusion ranking. */
  relevance: number;
  /** Source-specific raw score (BM25 for documents, match-strength for others). */
  rawScore: number;
  timestamp?: string;
  sessionId?: string;
  sessionTitle?: string;
  // ── document-specific ───────────────────────────────────────────────────
  materialId?: string;
  materialTitle?: string;
  filename?: string;
  section?: string;
  sectionPath?: string;
  page?: number;
  blockType?: string;
  // ── knowledge-specific ──────────────────────────────────────────────────
  knowledgeId?: string;
  knowledgeCategory?: string;
  // ── chat-specific ───────────────────────────────────────────────────────
  messageId?: string;
  /** Role of the matched message (user/assistant) — for chat badge. */
  messageRole?: string;
}

export interface GlobalSearchOptions {
  limit?: number;
  scope?: SearchScope;
  /** Restrict to one session (used when searching within an open session). */
  sessionId?: string;
}

// Per-source allocation caps so no single source starves the others.
// Document hits get the largest share (semantic = highest signal).
const ALLOC = {
  documents: 0.55,
  knowledge: 0.22,
  messages: 0.18,
  sessions: 0.12,
} as const;

/**
 * Run a unified search across the configured sources. Returns a fused, ranked
 * list of hits (max `limit`, default 24).
 */
export async function globalSearch(
  query: string,
  opts: GlobalSearchOptions = {}
): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.min(60, Math.max(1, opts.limit ?? 24));
  const scope = opts.scope ?? 'all';

  const tasks: Promise<SearchHit[]>[] = [];
  if (scope === 'all' || scope === 'documents') {
    tasks.push(searchDocuments(q, opts.sessionId, Math.ceil(limit * ALLOC.documents) + 4));
  }
  if (scope === 'all' || scope === 'knowledge') {
    tasks.push(searchKnowledge(q, opts.sessionId, Math.ceil(limit * ALLOC.knowledge) + 2));
  }
  if (scope === 'all' || scope === 'sessions') {
    tasks.push(searchSessions(q, opts.sessionId, Math.ceil(limit * ALLOC.sessions) + 1));
  }
  if (scope === 'all' || scope === 'messages') {
    tasks.push(searchMessages(q, opts.sessionId, Math.ceil(limit * ALLOC.messages) + 2));
  }

  const results = await Promise.all(tasks);
  const all = results.flat();

  // Sort by relevance desc, then by timestamp desc (newer first) for ties.
  all.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (a.timestamp && b.timestamp) return b.timestamp.localeCompare(a.timestamp);
    return 0;
  });

  return all.slice(0, limit);
}

// ─── Document chunk semantic search ──────────────────────────────────────────

async function searchDocuments(
  query: string,
  sessionId: string | undefined,
  limit: number
): Promise<SearchHit[]> {
  if (limit <= 0) return [];
  const where = sessionId
    ? { material: { sessionId, status: 'ready' } }
    : { material: { status: 'ready' } };

  const rows = await db.documentChunk.findMany({
    where,
    include: {
      material: {
        select: { id: true, title: true, filename: true, sessionId: true },
      },
    },
    take: 2000, // safety cap — BM25 cosine on 2000 chunks < 20ms
  });
  if (rows.length === 0) return [];

  const v2FieldsByChunkId = new Map<string, ChunkV2Fields>();
  const retrievables: (RetrievableChunk & { keywords?: string[]; summary?: string })[] = [];
  const chunkRowMap = new Map<string, (typeof rows)[number]>();

  for (const r of rows) {
    let meta: Record<string, unknown> = {};
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : {};
    } catch {
      /* ignore malformed metadata */
    }
    let bboxArr: [number, number, number, number] | undefined;
    if (r.bbox) {
      try {
        const parsed = JSON.parse(r.bbox);
        if (Array.isArray(parsed) && parsed.length === 4) {
          bboxArr = parsed as [number, number, number, number];
        }
      } catch {
        /* ignore malformed bbox */
      }
    }
    v2FieldsByChunkId.set(r.id, {
      blockType: r.blockType ?? undefined,
      sectionPath: r.sectionPath || undefined,
      sectionRole: r.sectionRole ?? undefined,
      bbox: bboxArr,
    });
    chunkRowMap.set(r.id, r);
    retrievables.push({
      id: r.id,
      content: r.content,
      section: r.section,
      embedding: r.embedding ? decodeEmbedding(r.embedding) : new Float32Array(1024),
      metadata: {
        page: r.page ?? (typeof meta.page === 'number' ? meta.page : undefined),
        level: typeof meta.level === 'number' ? meta.level : 0,
        isTitle: !!meta.isTitle,
        materialId: r.material.id,
        materialTitle: r.material.title || r.material.filename,
        filename: r.material.filename,
      },
      keywords: Array.isArray(meta.keywords) ? (meta.keywords as string[]) : [],
      summary: typeof meta.summary === 'string' ? meta.summary : '',
    });
  }

  // BM25 retrieve with expanded topK so boosts can re-rank a wider candidate set.
  const expandedK = Math.min(Math.max(limit * 3, 12), retrievables.length);
  let scored: ScoredChunk[] = retrieve(query, retrievables, expandedK);
  if (scored.length === 0) return [];

  applyRoleBoosts(scored, v2FieldsByChunkId, query);
  scored = applyLexicalBoosts(scored, query);

  const top = scored.slice(0, limit);

  // Resolve session titles for cross-session attribution.
  const sessionIds = [
    ...new Set(
      top
        .map((s) => chunkRowMap.get(s.chunk.id)?.material.sessionId)
        .filter((x): x is string => !!x)
    ),
  ];
  const sessions =
    sessionIds.length > 0
      ? await db.learningSession.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true, title: true },
        })
      : [];
  const sessionTitleMap = new Map(sessions.map((s) => [s.id, s.title]));

  // Normalise relevance: divide by the top score so the best hit → 1.0.
  const maxScore = top[0]?.score ?? 1;

  return top.map((s) => {
    const row = chunkRowMap.get(s.chunk.id)!;
    const v2 = v2FieldsByChunkId.get(s.chunk.id);
    const { snippet } = buildSnippet(s.chunk.content, query, 140);
    const sid = row.material.sessionId;
    return {
      id: `doc-${s.chunk.id}`,
      category: 'document' as const,
      title: s.chunk.metadata.materialTitle,
      snippet,
      relevance: Math.min(1, s.score / Math.max(maxScore, 0.1)),
      rawScore: s.score,
      sessionId: sid,
      sessionTitle: sid ? sessionTitleMap.get(sid) : undefined,
      materialId: s.chunk.metadata.materialId,
      materialTitle: s.chunk.metadata.materialTitle,
      filename: s.chunk.metadata.filename,
      section: s.chunk.section,
      sectionPath: v2?.sectionPath || undefined,
      page: s.chunk.metadata.page ?? undefined,
      blockType: v2?.blockType,
    };
  });
}

// ─── Knowledge node search (lexical + token overlap) ─────────────────────────

async function searchKnowledge(
  query: string,
  sessionId: string | undefined,
  limit: number
): Promise<SearchHit[]> {
  if (limit <= 0) return [];
  const where = sessionId ? { sessionId } : undefined;
  const nodes = await db.knowledgeNode.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 800,
    include: { session: { select: { id: true, title: true } } },
  });
  if (nodes.length === 0) return [];

  const qLower = query.toLowerCase();
  const queryTokens = qLower.split(/\s+/).filter((t) => t.length >= 2);

  const scored = nodes
    .map((n) => {
      const titleLower = n.title.toLowerCase();
      const contentLower = n.content.toLowerCase();
      let score = 0;
      if (titleLower.includes(qLower)) score += 0.85;
      if (contentLower.includes(qLower)) score += 0.5;
      // Token overlap on title (handles multi-word queries).
      if (queryTokens.length > 0) {
        const titleTokens = new Set(titleLower.split(/\s+/));
        const overlap = queryTokens.filter((t) => titleTokens.has(t)).length;
        score += 0.06 * overlap;
      }
      // Importance weighting (1-5 scale → 0..0.1).
      score += 0.02 * (n.importance ?? 3);
      return { node: n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ node, score }) => {
    const { snippet } = buildSnippet(node.content, query, 140);
    return {
      id: `kn-${node.id}`,
      category: 'knowledge' as const,
      title: node.title,
      snippet,
      relevance: Math.min(1, score / 1.4),
      rawScore: score,
      timestamp: node.updatedAt.toISOString(),
      sessionId: node.session.id,
      sessionTitle: node.session.title,
      knowledgeId: node.id,
      knowledgeCategory: node.category ?? undefined,
    };
  });
}

// ─── Session title/topic lexical search ──────────────────────────────────────

async function searchSessions(
  query: string,
  sessionId: string | undefined,
  limit: number
): Promise<SearchHit[]> {
  if (limit <= 0) return [];
  const where = {
    AND: [
      sessionId ? { id: sessionId } : {},
      {
        OR: [
          { title: { contains: query } },
          { topic: { contains: query } },
          { description: { contains: query } },
        ],
      },
    ],
  };
  const sessions = await db.learningSession.findMany({
    where: where as never,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return sessions.map((s) => {
    const qLower = query.toLowerCase();
    let score = 0.45;
    if (s.title.toLowerCase().includes(qLower)) score += 0.5;
    if (s.topic?.toLowerCase().includes(qLower)) score += 0.2;
    if (s.description?.toLowerCase().includes(qLower)) score += 0.1;
    return {
      id: `sess-${s.id}`,
      category: 'lesson' as const,
      title: s.title,
      snippet: s.topic || s.description || '学习主题',
      relevance: Math.min(1, score),
      rawScore: score,
      timestamp: s.updatedAt.toISOString(),
      sessionId: s.id,
    };
  });
}

// ─── Message content lexical search ──────────────────────────────────────────

async function searchMessages(
  query: string,
  sessionId: string | undefined,
  limit: number
): Promise<SearchHit[]> {
  if (limit <= 0) return [];
  const where = {
    content: { contains: query },
    ...(sessionId ? { sessionId } : {}),
  };
  const messages = await db.learningMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { session: { select: { id: true, title: true } } },
  });

  const qLower = query.toLowerCase();
  return messages.map((m) => {
    const content = (m.content || '').replace(/\s+/g, ' ').trim();
    const idx = content.toLowerCase().indexOf(qLower);
    const { snippet } = buildSnippet(content, query, 140);
    let score = 0.35;
    if (idx !== -1) score += 0.4;
    if (m.role === 'user') score += 0.05;
    return {
      id: `msg-${m.id}`,
      category: 'chat' as const,
      title: m.session?.title || '对话',
      snippet,
      relevance: Math.min(1, score),
      rawScore: score,
      timestamp: m.createdAt.toISOString(),
      sessionId: m.sessionId,
      sessionTitle: m.session?.title,
      messageId: m.id,
      messageRole: m.role,
    };
  });
}

// ─── introspection: count indexed chunks across all sessions ─────────────────

export async function getGlobalChunkCount(): Promise<number> {
  return db.documentChunk.count({ where: { material: { status: 'ready' } } });
}
