// ────────────────────────────────────────────────────────────────────────────
// retrieval.ts — high-level RAG helpers shared by /api/chat and /api/course/generate
//
// These functions wrap the low-level embed/retrieve primitives with DB access
// so the route handlers stay focused on prompt construction.
//
// Hybrid retrieval (v2):
//   1. BM25 cosine (lexical) — primary signal, always available.
//   2. Semantic keyword overlap — when chunks have LLM-generated keywords in
//      metadata.keywords, we boost chunks whose keywords appear in the query
//      (or whose query terms appear in the keywords). This lifts recall on
//      paraphrased / conceptual queries without requiring an embedding API.
//   3. Section / title boosts — unchanged from v1.
// ────────────────────────────────────────────────────────────────────────────

import { db } from './db';
import {
  embed,
  retrieve,
  decodeEmbedding,
  type RetrievableChunk,
  type ScoredChunk,
} from './text-embedding';
import type { SemanticTreeNode } from './semantic-index';
import { flattenTreeForRetrieval } from './semantic-index';
import ZAI from 'z-ai-web-dev-sdk';
import { applyRoleBoosts, applyLexicalBoosts } from './retrieval-boosts';

// ─── retrieve relevant chunks for a session's knowledge base ────────────────

export interface RetrievedPassage {
  materialId: string;
  materialTitle: string;
  filename: string;
  section: string;
  content: string;
  score: number;
  page?: number;
  /** v2: LLM-generated one-sentence summary of the chunk (if available). */
  summary?: string;
  // ── v2 fields (P1) ──────────────────────────────────────────────────────────
  /** Block type classification (text/title/table/figure/formula/list/code/...). */
  blockType?: string;
  /** Slash-delimited breadcrumb of enclosing sections, e.g. "3 Methods / 3.2 Training". */
  sectionPath?: string;
  /** GROBID section role for academic papers (abstract/introduction/methods/...). */
  sectionRole?: string;
  /** Bounding box [startX, startY, w, h] normalised [0,1] (figures/tables only). */
  bbox?: [number, number, number, number];
}

// ─── P2: vectorless tree-walk retrieval (PageIndex-style) ───────────────────
//
// Instead of embedding every chunk and doing cosine similarity, we:
//   1. Load the semantic tree (stored in LearningMaterial.outline) for each material.
//   2. Flatten to {materialId, nodeId, title, summary} — strip full text.
//   3. Send the flattened node list + query to glm-4-flash.
//   4. LLM returns {thinking, node_list: [nodeId, ...]} — the most relevant nodes.
//   5. Fetch chunks whose charStart falls within the selected nodes' char ranges.
//   6. These become tree-walk candidates, fused with BM25 candidates.
//
// This is cheap (one LLM call per retrieval, regardless of chunk count) and
// excels at conceptual queries where lexical overlap is low.

interface TreeWalkCandidate {
  chunkId: string;
  materialId: string;
  /** Rank position from the LLM (1 = most relevant). Lower rank = higher score. */
  rank: number;
  /** Tree-walk score: 1.0 / rank (so rank 1 → 1.0, rank 2 → 0.5, ...). */
  treeScore: number;
}

const TREE_WALK_PROMPT = `You are a vectorless retrieval engine. Given a document outline (nodes with title + summary) and a query, select the node_ids most relevant to the query.

Think step by step about which sections would contain the answer, then list their node_ids.

Output STRICT JSON:
{"thinking": "<brief reasoning>", "node_list": ["0", "0.1", "2.0", ...]}

Rules:
- Return at most 8 node_ids, ordered by relevance (most relevant first).
- Only return node_ids that appear in the outline below.
- If no nodes are relevant, return an empty node_list.

Query: {{QUERY}}

Document outline nodes:
{{NODES_JSON}}

Output JSON now:`;

/**
 * Run tree-walk retrieval across all materials in a session.
 *
 * @returns Map of chunkId → TreeWalkCandidate (for fusion with BM25 results).
 */
async function retrieveViaTreeWalk(
  sessionId: string,
  query: string
): Promise<Map<string, TreeWalkCandidate>> {
  const candidates = new Map<string, TreeWalkCandidate>();

  // Load all materials with their outline (semantic tree).
  const materials = await db.learningMaterial.findMany({
    where: { sessionId, status: 'ready', NOT: { outline: null } },
    select: { id: true, outline: true },
  });

  // Parse outlines into flat node lists. Only outlines that look like
  // SemanticTreeNode[] (have nodeId) qualify for tree-walk.
  const allNodes: { materialId: string; nodeId: string; title: string; summary: string; charStart: number; charEnd: number }[] = [];
  const materialNodeMap = new Map<string, { nodes: typeof allNodes; }>();

  for (const m of materials) {
    if (!m.outline) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(m.outline);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    // Check if it's a SemanticTreeNode[] (has nodeId) vs flat OutlineNode[].
    const isSemanticTree = parsed.length > 0 && parsed[0]?.nodeId !== undefined;
    if (!isSemanticTree) continue;

    const nodes = flattenTreeForRetrieval(parsed as SemanticTreeNode[], m.id);
    if (nodes.length === 0) continue;
    allNodes.push(...nodes);
    materialNodeMap.set(m.id, { nodes });
  }

  // Need at least 3 nodes for tree-walk to be meaningful.
  if (allNodes.length < 3) return candidates;

  // Cap the node list to stay within prompt budget (~50 nodes max).
  const cappedNodes = allNodes.slice(0, 50).map((n) => ({
    materialId: n.materialId,
    nodeId: n.nodeId,
    title: n.title,
    summary: n.summary?.slice(0, 200) ?? '',
  }));

  try {
    const zai = await ZAI.create();
    const prompt = TREE_WALK_PROMPT
      .replace('{{QUERY}}', query.slice(0, 500))
      .replace('{{NODES_JSON}}', JSON.stringify(cappedNodes));

    const completion = await zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a precise JSON-only responder. Never include markdown fences or prose outside JSON.',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    });

    const text = extractContentLocal(completion);
    const nodeList = parseTreeWalkResponse(text);
    if (nodeList.length === 0) return candidates;

    // Fetch chunks whose charStart falls within selected nodes' char ranges.
    // Build a map: materialId → list of (nodeId, charStart, charEnd).
    const selectedByMaterial = new Map<string, { nodeId: string; charStart: number; charEnd: number; rank: number }[]>();
    nodeList.forEach((nodeRef, rank) => {
      // nodeRef is "materialId:nodeId" or just "nodeId".
      const [matId, nodeId] = nodeRef.includes(':') ? nodeRef.split(':', 2) : [undefined, nodeRef];
      // Find the node in allNodes.
      const node = allNodes.find((n) =>
        (matId ? n.materialId === matId : true) && n.nodeId === nodeId
      );
      if (!node) return;
      const list = selectedByMaterial.get(node.materialId) ?? [];
      list.push({ nodeId: node.nodeId, charStart: node.charStart, charEnd: node.charEnd, rank: rank + 1 });
      selectedByMaterial.set(node.materialId, list);
    });

    // Fetch chunks for each material and match by char range.
    for (const [matId, nodeRanges] of selectedByMaterial) {
      const chunks = await db.documentChunk.findMany({
        where: { materialId: matId },
        select: { id: true, charStart: true },
      });
      for (const chunk of chunks) {
        // Find the best-matching node range (the one containing chunk.charStart).
        let bestRank = Infinity;
        for (const range of nodeRanges) {
          if (chunk.charStart >= range.charStart && chunk.charStart < range.charEnd) {
            if (range.rank < bestRank) bestRank = range.rank;
          }
        }
        if (bestRank < Infinity) {
          candidates.set(chunk.id, {
            chunkId: chunk.id,
            materialId: matId,
            rank: bestRank,
            treeScore: 1.0 / bestRank,
          });
        }
      }
    }
  } catch (err) {
    console.error('[retrieval] tree-walk failed:', err);
    // Non-fatal — BM25 fusion still works.
  }

  return candidates;
}

/** Extract text from a z-ai completion (handles multiple response shapes). */
function extractContentLocal(completion: any): string {
  if (!completion) return '';
  const choices = completion.choices || completion.data?.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = choices[0].message || choices[0].delta;
    if (msg?.content) {
      return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    }
  }
  if (typeof completion.content === 'string') return completion.content;
  return '';
}

/** Parse the tree-walk LLM response, returning the list of "materialId:nodeId" or "nodeId" refs. */
function parseTreeWalkResponse(text: string): string[] {
  if (!text) return [];
  let s = text.trim();
  // Strip markdown fences.
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // Find the JSON object.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];
  const slice = s.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    if (Array.isArray(parsed.node_list)) {
      return parsed.node_list.filter((x: any) => typeof x === 'string').slice(0, 8);
    }
  } catch {
    // Fall through.
  }
  return [];
}

/**
 * Retrieve the top-K most relevant passages from a session's knowledge base.
 *
 * Implementation:
 *   1. Fetch all DocumentChunk rows for the session (join → material).
 *   2. Decode each chunk's stored embedding.
 *   3. Call retrieve() with the query embedding.
 *   4. Map ScoredChunk → RetrievedPassage (drop the Float32Array, keep text).
 *
 * For sessions with many chunks (>500) this becomes the hot path. Future
 * optimisation: persist chunks pre-decoded in memory (LRU) or use sqlite-vec
 * for native vector search. For now, JS-side cosine is fast enough at this
 * scale (1024-dim dot product on ~500 chunks < 5ms).
 */
export async function retrievePassages(
  sessionId: string,
  query: string,
  topK = 6
): Promise<RetrievedPassage[]> {
  if (!query.trim()) return [];

  // ── P2: kick off tree-walk retrieval in parallel with BM25. ─────────────
  // Tree-walk is vectorless (one LLM call), so we run it concurrently.
  // If it fails or returns nothing, BM25 alone handles retrieval.
  const treeWalkPromise = retrieveViaTreeWalk(sessionId, query);

  // Fetch chunks with their parent material metadata.
  const rows = await db.documentChunk.findMany({
    where: { material: { sessionId, status: 'ready' } },
    include: {
      material: {
        select: { id: true, title: true, filename: true, content: true },
      },
    },
  });

  if (rows.length === 0) return [];

  // Build retrievable chunks (decode embeddings lazily).
  // We also extract `keywords` and `summary` from metadata (v2 semantic index).
  // v2: also cache the new DB columns (blockType / sectionPath / sectionRole / bbox)
  // keyed by chunk id, so the final RetrievedPassage mapping can surface them.
  const v2FieldsByChunkId = new Map<string, {
    blockType?: string;
    sectionPath?: string;
    sectionRole?: string;
    bbox?: [number, number, number, number];
  }>();

  const retrievables: RetrievableChunk[] = rows.map((r) => {
    let meta: any = {};
    try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch { /* ignore */ }
    // Cache v2 fields for the output stage.
    let bboxArr: [number, number, number, number] | undefined;
    if (r.bbox) {
      try {
        const parsed = JSON.parse(r.bbox);
        if (Array.isArray(parsed) && parsed.length === 4) {
          bboxArr = parsed as [number, number, number, number];
        }
      } catch { /* ignore malformed bbox */ }
    }
    v2FieldsByChunkId.set(r.id, {
      blockType: r.blockType ?? undefined,
      sectionPath: r.sectionPath || undefined,
      sectionRole: r.sectionRole ?? undefined,
      bbox: bboxArr,
    });
    return {
      id: r.id,
      content: r.content,
      section: r.section,
      embedding: r.embedding ? decodeEmbedding(r.embedding) : new Float32Array(1024),
      metadata: {
        page: r.page ?? meta.page,
        level: meta.level ?? 0,
        isTitle: !!meta.isTitle,
        materialId: r.material.id,
        materialTitle: r.material.title || r.material.filename,
        filename: r.material.filename,
      },
      // v2 semantic fields (optional — absent on v1 chunks).
      keywords: Array.isArray(meta.keywords) ? meta.keywords as string[] : [],
      summary: typeof meta.summary === 'string' ? meta.summary : '',
    } as RetrievableChunk & { keywords: string[]; summary: string };
  });

  // Parent-section text resolver: given a chunk, return up to 4000 chars of
  // its enclosing section's text from the parent material. This emulates
  // Anthropic's "contextual retrieval" pattern — the leaf chunk gives
  // precision, the parent section gives surrounding context.
  const materialTextCache = new Map<string, string>();
  const getParentText = (c: RetrievableChunk): string | undefined => {
    let fullText = materialTextCache.get(c.metadata.materialId);
    if (fullText === undefined) {
      const row = rows.find((r) => r.material.id === c.metadata.materialId);
      fullText = row?.material.content || '';
      materialTextCache.set(c.metadata.materialId, fullText);
    }
    if (!fullText) return undefined;
    // Find the chunk's charStart in the parent material.
    const row = rows.find((r) => r.id === c.id);
    if (!row) return undefined;
    // Look back up to 4000 chars for context, ending at chunk end.
    const start = Math.max(0, row.charStart - 1500);
    const end = Math.min(fullText.length, row.charEnd + 2500);
    return fullText.slice(start, end).trim();
  };

  // ── P2: retrieve with expanded topK to gather fusion candidates. ──────────
  // We fetch 3×topK from BM25 so tree-walk candidates that aren't in BM25's
  // top-K can still be fused in. After fusion we trim to the final topK.
  const expandedK = Math.min(topK * 3, rows.length);
  const scored: ScoredChunk[] = retrieve(query, retrievables, expandedK, getParentText);

  // ── P2: fuse tree-walk candidates with BM25 results. ──────────────────────
  //
  // For each BM25-scored chunk, check if it's also a tree-walk candidate.
  // If so, add treeScore (max 0.5, weighted lower than BM25) to its score.
  // Also inject any tree-walk candidates that BM25 missed — these get a
  // base score (0.3) so they rank competitively but don't dominate.
  const treeCandidates = await treeWalkPromise;
  const fused = [...scored];

  if (treeCandidates.size > 0) {
    // Boost BM25 results that are also tree-walk hits.
    for (const s of fused) {
      const tc = treeCandidates.get(s.chunk.id);
      if (tc) {
        s.score += Math.min(tc.treeScore * 0.5, 0.5);
      }
    }
    // Inject tree-walk-only candidates (not in BM25 top-K).
    const bm25Ids = new Set(scored.map((s) => s.chunk.id));
    for (const [chunkId, tc] of treeCandidates) {
      if (bm25Ids.has(chunkId)) continue;
      const chunk = retrievables.find((r) => r.id === chunkId);
      if (!chunk) continue;
      // Tree-walk-only candidates get a modest base score + tree boost.
      fused.push({
        chunk,
        score: 0.3 + Math.min(tc.treeScore * 0.4, 0.4),
        parentSectionText: getParentText(chunk),
      } as ScoredChunk);
    }
  }

  // ── P4 + v2: shared re-ranking boosts ─────────────────────────────────────
  //
  // role-boost (GROBID section taxonomy) + semantic-keyword boost + CJK
  // short-query substring boost are now shared with the global search service
  // via retrieval-boosts.ts. See that file for the full algorithm notes.
  applyRoleBoosts(fused, v2FieldsByChunkId, query);
  const boosted = applyLexicalBoosts(fused, query);

  // Trim to final topK after fusion.
  const finalResults = boosted.slice(0, topK);

  return finalResults.map((s) => {
    const extra = s.chunk as RetrievableChunk & { summary?: string };
    const v2 = v2FieldsByChunkId.get(s.chunk.id);
    return {
      materialId: s.chunk.metadata.materialId,
      materialTitle: s.chunk.metadata.materialTitle,
      filename: s.chunk.metadata.filename,
      section: s.chunk.section,
      content: s.parentSectionText || s.chunk.content,
      score: s.score,
      page: s.chunk.metadata.page,
      // Include the chunk's semantic summary if present — useful for UI display.
      summary: extra.summary,
      // v2 fields (undefined on legacy v1 chunks):
      blockType: v2?.blockType,
      sectionPath: v2?.sectionPath,
      sectionRole: v2?.sectionRole,
      bbox: v2?.bbox,
    };
  });
}

// ─── build a grounded knowledge-base context block ──────────────────────────

/**
 * Build a markdown-formatted knowledge-base context block for injection into
 * LLM prompts. Each passage is cited as [来源: <filename> · <section>].
 *
 * Budget-capped to `maxChars` (default 18k) so we leave room for the actual
 * conversation history.
 */
export function buildKnowledgeBaseContext(
  passages: RetrievedPassage[],
  maxChars = 18_000
): string {
  if (passages.length === 0) return '';

  const parts: string[] = [];
  let used = 0;
  for (const p of passages) {
    if (used >= maxChars) break;
    const remaining = maxChars - used;
    const content = p.content.length > remaining ? p.content.slice(0, remaining) + '…' : p.content;
    const citation = `[来源：${p.materialTitle}${p.section ? ` · ${p.section}` : ''}${p.page ? ` · p.${p.page}` : ''}]`;
    parts.push(`${citation}\n${content}`);
    used += content.length + citation.length + 2;
  }

  return `## 学习者导入的资料（基于检索的相关片段）\n\n以下是从学习者导入的学习资料中检索到的、与当前问题最相关的片段。在回答时，应优先引用这些片段中的具体概念、术语、定义；如片段未覆盖问题，再使用通用知识。\n\n${parts.join('\n\n---\n\n')}\n`;
}

// ─── introspection: count chunks for a session (for stats / UI) ──────────────

export async function getSessionChunkCount(sessionId: string): Promise<number> {
  const result = await db.documentChunk.count({
    where: { material: { sessionId, status: 'ready' } },
  });
  return result;
}

// Re-export embed for callers that need to embed a query directly.
export { embed };
