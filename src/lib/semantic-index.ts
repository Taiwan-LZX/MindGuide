// ────────────────────────────────────────────────────────────────────────────
// semantic-index.ts — LLM-powered semantic enrichment for retrieval
//
// Problem: The z-ai SDK has no embeddings endpoint. Our BM25 hashed TF-IDF
// (text-embedding.ts) is good for lexical overlap but blind to synonyms and
// abstractions — a query "gradient descent" won't match a chunk that says
// "the optimisation step minimises loss via partial derivatives" even though
// they're semantically identical.
//
// Solution: Use the chat-completion LLM to add a semantic layer on top of the
// lexical layer, computed once at ingestion time:
//
//   1. Per-chunk semantic keywords: ask the LLM for 5-10 keywords/tags that
//      capture the *concept* of the chunk (not just surface words). These get
//      folded into the chunk's embedding by concatenating them with the chunk
//      text before embed(). This lifts recall on paraphrased queries.
//
//   2. Document summary tree: ask the LLM for a 3-level outline summary of
//      the whole document (one paragraph per top-level section). This gets
//      stored in LearningMaterial.outline and used as "context preamble" when
//      grounding chat responses — so the model knows the document's structure
//      even if only 3 chunks are retrieved.
//
//   3. (Optional) HyDE at query time: already implemented in text-embedding.ts.
//
// Cost control:
//   - Per-chunk keywords: batched — we send 5 chunks per LLM call to amortise.
//     A 600-chunk document = 120 calls. At ~500 tokens each that's ~60k tokens.
//   - Document summary: 1 call per document, ~2k tokens.
//   - Both are OPTIONAL — the system works without them (pure BM25). They're
//     triggered by `precision='high'` or an explicit `enrich=true` flag.
// ────────────────────────────────────────────────────────────────────────────

import ZAI from 'z-ai-web-dev-sdk';
import type { Chunk } from './document-chunker';
import type { ParsedDocument } from './file-parser';

export interface SemanticKeywords {
  /** 5-10 concept-level keywords for the chunk. */
  keywords: string[];
  /** One-sentence semantic summary (≤ 200 chars). */
  summary: string;
}

export interface DocumentSummaryNode {
  title: string;
  /** One-paragraph summary (≤ 400 chars). */
  summary: string;
  /** Child sections (level 2+). */
  children: DocumentSummaryNode[];
}

// ─── P2: semantic tree node (PageIndex-style vectorless retrieval) ──────────
//
// The tree is built from the document's heading structure (stack-based walk),
// assigned DFS node_ids ("0", "0.0", "0.1.0"), and thinned (nodes with < 5000
// total tokens are flattened into their parent). This tree is what the
// tree-walk retrieval sends to the LLM — only {nodeId, title, summary}, no
// full text — so the LLM can navigate the document structure cheaply.
export interface SemanticTreeNode {
  /** DFS-assigned node id, e.g. "0", "0.0", "0.1.0". */
  nodeId: string;
  title: string;
  /** LLM-generated one-paragraph summary (≤ 400 chars). Empty if not enriched. */
  summary: string;
  /** Char range of this node's OWN content (excluding children). */
  charStart: number;
  charEnd: number;
  /** Estimated tokens in this node's own content (excluding children). */
  tokenCount: number;
  /** Total tokens including all descendants (used for thinning). */
  totalTokens: number;
  /** Child nodes (deeper headings). */
  children: SemanticTreeNode[];
}

export interface SemanticIndexResult {
  /** Per-chunk semantic enrichment, indexed by chunkIndex. */
  chunks: Map<number, SemanticKeywords>;
  /** Document-level summary tree (legacy flat format, may be empty). */
  summary: DocumentSummaryNode[];
  /** P2: semantic tree for vectorless tree-walk retrieval (may be empty). */
  tree: SemanticTreeNode[];
  /** Telemetry: total LLM tokens used. */
  tokensUsed: number;
  /** Telemetry: wall-clock time. */
  latencyMs: number;
}

// ─── batched chunk keyword extraction ───────────────────────────────────────
//
// We batch 5 chunks per LLM call. The prompt asks for a JSON array of
// {keywords, summary} objects. We parse defensively — a malformed response
// falls back to empty keywords for that batch.

const CHUNK_BATCH_SIZE = 5;

const CHUNK_KEYWORD_PROMPT = `You are a semantic indexer for a RAG retrieval system. For each text chunk below, produce:
- "keywords": 5-10 concept-level keywords/phrases that capture WHAT the chunk is about (not surface words — think "what would I search to find this?"). Mix English + Chinese if the chunk is Chinese.
- "summary": a single sentence (≤ 200 chars) summarising the chunk's main point.

Output STRICT JSON: an array of objects, one per input chunk, in order. No markdown fences, no commentary.

Chunks:
{{CHUNKS_JSON}}

Output JSON array now:`;

export async function enrichChunksSemantic(
  chunks: Chunk[],
  signal?: AbortSignal
): Promise<Map<number, SemanticKeywords>> {
  const out = new Map<number, SemanticKeywords>();
  if (chunks.length === 0) return out;

  const zai = await ZAI.create();
  // Process batches serially to avoid rate limits. Each batch is one call.
  for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE);
    const payload = batch.map((c, idx) => ({
      index: idx,
      section: c.section || '',
      text: c.content.slice(0, 1200), // cap to keep prompt bounded
    }));
    const prompt = CHUNK_KEYWORD_PROMPT.replace('{{CHUNKS_JSON}}', JSON.stringify(payload));

    try {
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
      const text = extractContent(completion);
      const parsed = parseJsonArray(text);
      if (Array.isArray(parsed)) {
        for (let j = 0; j < parsed.length && j < batch.length; j++) {
          const item = parsed[j];
          if (item && typeof item === 'object') {
            out.set(batch[j].chunkIndex, {
              keywords: Array.isArray(item.keywords)
                ? item.keywords.filter((k: unknown) => typeof k === 'string').slice(0, 12)
                : [],
              summary: typeof item.summary === 'string' ? item.summary.slice(0, 200) : '',
            });
          }
        }
      }
    } catch (err) {
      console.error(`[semantic-index] batch ${i / CHUNK_BATCH_SIZE} failed:`, err);
      // Continue — partial enrichment is fine.
    }
  }
  return out;
}

// ─── document summary tree ──────────────────────────────────────────────────

const DOC_SUMMARY_PROMPT = `You are summarising a document for a learning platform. Given the document's section outline and a sample of text from each top-level section, produce a 3-level summary tree.

For each top-level section, write:
- "title": the section title (clean it up if messy)
- "summary": ONE paragraph (≤ 400 chars) explaining what this section covers and its key takeaways
- "children": array of {title, summary} for notable sub-sections (≤ 200 chars each). Omit if none.

Output STRICT JSON: an array of section objects. No fences, no commentary.

Document outline + samples:
{{OUTLINE}}

Output JSON array now:`;

export async function generateDocumentSummary(
  doc: ParsedDocument,
  _signal?: AbortSignal
): Promise<DocumentSummaryNode[]> {
  if (!doc.text || doc.text.length < 200) return [];

  const zai = await ZAI.create();

  // Build a compact outline-with-samples payload. For each top-level section
  // (level <= 2), include the title + first 600 chars of the section body.
  const sections = [...doc.sections].sort((a, b) => a.charStart - b.charStart);
  const topSections = sections.filter((s) => s.level <= 2);
  const payload = topSections.slice(0, 20).map((s) => {
    const end = sections.find((s2) => s2.charStart > s.charStart && s2.level <= s.level);
    const body = doc.text.slice(s.charStart, end ? end.charStart : Math.min(s.charStart + 800, doc.text.length));
    return { title: s.title, sample: body.slice(0, 600) };
  });

  if (payload.length === 0) {
    // No sections detected — just summarise the first 2000 chars.
    payload.push({ title: 'Document', sample: doc.text.slice(0, 600) });
  }

  const prompt = DOC_SUMMARY_PROMPT.replace('{{OUTLINE}}', JSON.stringify(payload));

  try {
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
    const text = extractContent(completion);
    const parsed = parseJsonArray(text);
    if (Array.isArray(parsed)) {
      return parsed.map((node: any) => ({
        title: typeof node?.title === 'string' ? node.title.slice(0, 200) : '',
        summary: typeof node?.summary === 'string' ? node.summary.slice(0, 500) : '',
        children: Array.isArray(node?.children)
          ? node.children.map((ch: any) => ({
              title: typeof ch?.title === 'string' ? ch.title.slice(0, 200) : '',
              summary: typeof ch?.summary === 'string' ? ch.summary.slice(0, 250) : '',
              children: [],
            }))
          : [],
      }));
    }
  } catch (err) {
    console.error('[semantic-index] doc summary failed:', err);
  }
  return [];
}

// ─── combined enrichment (call this from the upload pipeline) ───────────────

export async function buildSemanticIndex(
  doc: ParsedDocument,
  chunks: Chunk[],
  signal?: AbortSignal
): Promise<SemanticIndexResult> {
  const start = Date.now();
  // Build the semantic tree first (no LLM call — pure structure).
  const rawTree = mdToTree(doc);

  // Run chunk keywords + document summary + tree summary enrichment in parallel.
  const [chunkMap, summary, tree] = await Promise.all([
    enrichChunksSemantic(chunks, signal),
    generateDocumentSummary(doc, signal),
    enrichTreeSummaries(rawTree, doc, signal),
  ]);
  return {
    chunks: chunkMap,
    summary,
    tree,
    tokensUsed: 0, // not tracked yet; wire to completion telemetry if needed
    latencyMs: Date.now() - start,
  };
}

// ─── P2: md_to_tree — build a semantic tree from document headings ──────────
//
// This is the PageIndex-style vectorless retrieval structure. The tree is:
//   1. Built from doc.sections (stack-based heading walk)
//   2. Assigned DFS node_ids ("0", "0.0", "0.1.0")
//   3. Thinned — nodes with < 5000 total tokens are flattened into their parent
//      (reduces tree depth for short sections, keeping retrieval efficient)
//   4. Optionally enriched with LLM summaries (one paragraph per node)
//
// The tree is stored in LearningMaterial.outline (JSON) and consumed by
// retrieveViaTreeWalk() in retrieval.ts.

/** Threshold for thinning: nodes with < this many total tokens get flattened. */
//
// Tuned for study-material scale. At 500 tokens ≈ 2k chars ≈ 4 pages, a
// section is "small enough" that its sub-sections don't need separate
// tree-walk nodes — the LLM can evaluate the section as one unit.
//
// Above 500 tokens, the tree keeps its depth so tree-walk can navigate to
// the right sub-section. This balances:
//   - Small docs (1-3 pages): flatten to 1-2 nodes (tree-walk not useful)
//   - Medium docs (3-15 pages): 1 root + N leaf sections (tree-walk useful)
//   - Large docs (15+ pages): multi-level tree (tree-walk most useful)
const THIN_TOKEN_THRESHOLD = 500;

/**
 * Build a semantic tree from a ParsedDocument's heading structure.
 * Does NOT call the LLM — summaries are empty until `enrichTreeSummaries` runs.
 *
 * @param doc  The parsed document (uses doc.sections + doc.text)
 * @returns    Array of root-level SemanticTreeNode (each with DFS-assigned nodeId)
 */
export function mdToTree(doc: ParsedDocument): SemanticTreeNode[] {
  if (!doc.sections || doc.sections.length === 0) return [];

  const sections = [...doc.sections].sort((a, b) => a.charStart - b.charStart);
  const text = doc.text;

  // Build raw tree via stack-based heading walk.
  interface RawNode {
    title: string;
    charStart: number;
    charEnd: number;
    level: number;
    children: RawNode[];
  }
  const roots: RawNode[] = [];
  const stack: RawNode[] = [];

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    // Find charEnd: start of next section at same-or-shallower level, or EOF.
    let end = text.length;
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].level <= s.level) {
        end = sections[j].charStart;
        break;
      }
    }
    const node: RawNode = { title: s.title, charStart: s.charStart, charEnd: end, level: s.level, children: [] };
    // Pop stack until we find a parent with strictly smaller level.
    while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  // Convert RawNode → SemanticTreeNode with token counts + DFS node_ids.
  const convert = (node: RawNode, parentId: string, index: number): SemanticTreeNode => {
    const nodeId = parentId ? `${parentId}.${index}` : `${index}`;
    // Own content = text from this node's start to its first child's start
    // (or to its end if no children).
    let ownEnd = node.charEnd;
    if (node.children.length > 0) {
      ownEnd = node.children[0].charStart;
    }
    const ownText = text.slice(node.charStart, ownEnd);
    const ownTokens = estimateTokensLocal(ownText);

    const children = node.children.map((c, i) => convert(c, nodeId, i));
    const totalTokens = ownTokens + children.reduce((sum, c) => sum + c.totalTokens, 0);

    return {
      nodeId,
      title: node.title,
      summary: '', // filled by enrichTreeSummaries
      charStart: node.charStart,
      charEnd: node.charEnd,
      tokenCount: ownTokens,
      totalTokens,
      children,
    };
  };

  const tree = roots.map((r, i) => convert(r, '', i));

  // Thinning: flatten nodes with < THIN_TOKEN_THRESHOLD total tokens.
  return thinTree(tree);
}

/**
 * Thin the tree: if a node's total tokens (including descendants) is below
 * THIN_TOKEN_THRESHOLD, merge all its children into itself (flatten).
 * This reduces tree depth for short sections, keeping tree-walk retrieval
 * efficient. Applied recursively bottom-up.
 */
function thinTree(nodes: SemanticTreeNode[]): SemanticTreeNode[] {
  const result: SemanticTreeNode[] = [];
  for (const node of nodes) {
    // Recursively thin children first (bottom-up).
    const thinnedChildren = thinTree(node.children);

    if (node.totalTokens < THIN_TOKEN_THRESHOLD && thinnedChildren.length > 0) {
      // Flatten: merge children's content into this node.
      // The node keeps its own charStart but extends to the last descendant's charEnd.
      const allDescendants = collectAllDescendants(thinnedChildren);
      result.push({
        ...node,
        children: [],
        charEnd: allDescendants.length > 0
          ? allDescendants[allDescendants.length - 1].charEnd
          : node.charEnd,
        totalTokens: node.tokenCount + allDescendants.reduce((s, d) => s + d.tokenCount, 0),
      });
    } else {
      result.push({ ...node, children: thinnedChildren });
    }
  }
  return result;
}

/** Recursively collect all descendants (depth-first) of a list of nodes. */
function collectAllDescendants(nodes: SemanticTreeNode[]): SemanticTreeNode[] {
  const out: SemanticTreeNode[] = [];
  for (const n of nodes) {
    out.push(n);
    out.push(...collectAllDescendants(n.children));
  }
  return out;
}

/**
 * Enrich tree nodes with LLM-generated summaries (one paragraph per node).
 * Batched: sends up to 10 nodes per LLM call. Nodes with no meaningful content
 * (tokenCount < 10) are skipped.
 *
 * @returns The tree with `summary` fields filled in (best-effort).
 */
export async function enrichTreeSummaries(
  tree: SemanticTreeNode[],
  doc: ParsedDocument,
  signal?: AbortSignal
): Promise<SemanticTreeNode[]> {
  // Flatten tree to a list of nodes that need summaries.
  const needSummary: SemanticTreeNode[] = [];
  const collect = (nodes: SemanticTreeNode[]) => {
    for (const n of nodes) {
      if (n.tokenCount >= 10) needSummary.push(n);
      collect(n.children);
    }
  };
  collect(tree);

  if (needSummary.length === 0) return tree;

  const zai = await ZAI.create();
  const BATCH = 10;

  // Build a map nodeId → summary for quick lookup after enrichment.
  const summaryMap = new Map<string, string>();

  for (let i = 0; i < needSummary.length; i += BATCH) {
    if (signal?.aborted) break;
    const batch = needSummary.slice(i, i + BATCH);
    const payload = batch.map((n) => ({
      nodeId: n.nodeId,
      title: n.title,
      // Send first 500 chars of the node's own content as a sample.
      sample: doc.text.slice(n.charStart, Math.min(n.charStart + 500, n.charEnd)),
    }));

    const prompt = TREE_SUMMARY_PROMPT.replace('{{NODES_JSON}}', JSON.stringify(payload));
    try {
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
      const text = extractContent(completion);
      const parsed = parseJsonArray(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.nodeId === 'string' && typeof item.summary === 'string') {
            summaryMap.set(item.nodeId, item.summary.slice(0, 400));
          }
        }
      }
    } catch (err) {
      console.error('[semantic-index] tree summary batch failed:', err);
      // Continue — partial enrichment is fine.
    }
  }

  // Fill summaries back into the tree.
  const fillSummaries = (nodes: SemanticTreeNode[]): SemanticTreeNode[] =>
    nodes.map((n) => ({
      ...n,
      summary: summaryMap.get(n.nodeId) ?? '',
      children: fillSummaries(n.children),
    }));

  return fillSummaries(tree);
}

const TREE_SUMMARY_PROMPT = `You are summarising document sections for a vectorless tree-walk retrieval system. For each node below, write a one-paragraph summary (≤ 400 chars) explaining what the section covers and its key takeaways.

Output STRICT JSON: an array of {nodeId, summary} objects. No fences, no commentary.

Nodes:
{{NODES_JSON}}

Output JSON array now:`;

/** Local token estimator (mirrors document-chunker.estimateTokens). */
function estimateTokensLocal(text: string): number {
  if (!text) return 0;
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const other = text.length - han;
  return Math.ceil(han / 2 + other / 4);
}

/**
 * Flatten a semantic tree into a list of {nodeId, title, summary} for LLM
 * tree-walk retrieval. Only includes nodes with a non-empty title.
 */
export function flattenTreeForRetrieval(
  tree: SemanticTreeNode[],
  materialId: string
): { materialId: string; nodeId: string; title: string; summary: string; charStart: number; charEnd: number }[] {
  const out: { materialId: string; nodeId: string; title: string; summary: string; charStart: number; charEnd: number }[] = [];
  const walk = (nodes: SemanticTreeNode[]) => {
    for (const n of nodes) {
      if (n.title.trim()) {
        out.push({
          materialId,
          nodeId: n.nodeId,
          title: n.title,
          summary: n.summary,
          charStart: n.charStart,
          charEnd: n.charEnd,
        });
      }
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function extractContent(completion: any): string {
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

/**
 * Parse a JSON array from an LLM response, tolerating:
 *   - Leading/trailing whitespace
 *   - Markdown fences ```json ... ```
 *   - Trailing prose after the array
 */
function parseJsonArray(text: string): any[] | null {
  if (!text) return null;
  let s = text.trim();
  // Strip fences
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // Find the first `[` and last `]` — extract that slice.
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}
