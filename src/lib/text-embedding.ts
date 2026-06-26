// ────────────────────────────────────────────────────────────────────────────
// text-embedding.ts — local BM25-style hashed TF-IDF embedding + retrieval
//
// Why local? The z-ai-web-dev-sdk does not expose an embeddings endpoint.
// Rather than depend on a hosted embedding model (network latency, cost,
// availability), we implement a feature-hashing BM25 variant in pure
// TypeScript. This is the same family of algorithms that powered Lucene /
// Elasticsearch before neural retrievers, and it remains competitive for
// retrieval-quality-vs-cost on small-to-medium corpora (<10k chunks).
//
// Algorithm (see docs/FILE-IMPORT.md §5 for details + references):
//   1. Tokenise:
//      - CJK (\p{Script=Han}): overlapping bigrams  (机器学习 → 机器|器学|学习)
//      - Latin: lowercase, split on non-alphanumeric, drop stopwords.
//   2. Hash each token via FNV-1a into 1024 buckets. Increment the bucket
//      by 1 (term frequency). Use the hash's high bit as a sign (+1/-1)
//      to counter the all-positive bias of hashed representations
//      (Weinberger et al. 2009 "feature hashing").
//   3. Apply sublinear TF scaling (1 + log(tf)) to dampen frequent terms.
//   4. L2-normalise the resulting 1024-dim Float32Array.
//
// Cosine similarity of two L2-normalised vectors = their dot product.
// ────────────────────────────────────────────────────────────────────────────

export const EMBED_DIM = 1024;

// English stopwords (small, aggressive — we want retrieval to favour
// content words). CJK has no universal stopword list, so we don't filter.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
  'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'will',
  'would', 'should', 'could', 'ought', 'shall', 'may', 'might', 'must',
  'can', 'cannot', 'of', 'as', 'this', 'that', 'these', 'those', 'it',
  'its', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'us',
  'them', 'my', 'your', 'our', 'their', 'his', 'hers', 'ours', 'theirs',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'why', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now',
]);

// ─── tokenisation ───────────────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  if (!text) return tokens;

  // CJK bigrams: scan for runs of Han characters and emit overlapping pairs.
  // A single Han char becomes a unigram (rare but possible).
  const hanRe = /\p{Script=Han}+/gu;
  let m: RegExpExecArray | null;
  while ((m = hanRe.exec(text)) !== null) {
    const run = m[0];
    if (run.length === 1) {
      tokens.push(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) {
        tokens.push(run.slice(i, i + 2));
      }
      // Also push the final unigram so single-char queries match.
      tokens.push(run[run.length - 1]);
    }
  }

  // Latin: lowercase, split on non-alphanumeric (keeps CJK out, since the
  // regex \p{Script=Han} already consumed those).
  const latinRe = /[a-zA-Z][a-zA-Z0-9'-]*/g;
  while ((m = latinRe.exec(text)) !== null) {
    const w = m[0].toLowerCase();
    if (w.length < 2) continue;           // drop single letters
    if (STOPWORDS.has(w)) continue;        // drop stopwords
    if (/^\d+$/.test(w) && w.length < 4) continue; // drop tiny numbers
    tokens.push(w);
  }

  return tokens;
}

// ─── FNV-1a hash ────────────────────────────────────────────────────────────

function fnv1a(s: string): number {
  // 32-bit FNV-1a. Bun/Node's `>>> 0` coerces to uint32.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ─── embedding ──────────────────────────────────────────────────────────────

/**
 * Embed text into a 1024-dim L2-normalised Float32Array.
 *
 * Each token contributes:
 *   - +1 (or -1, based on hash high bit) × (1 + log2(tf)) to its bucket.
 *   - This is "signed feature hashing with sublinear TF" — a well-known
 *     sparse-retrieval approximation of BM25.
 */
export function embed(text: string): Float32Array {
  const vec = new Float32Array(EMBED_DIM);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  // Term frequencies.
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  for (const [tok, count] of tf) {
    const h = fnv1a(tok);
    const bucket = h % EMBED_DIM;
    const sign = (h >>> 31) === 0 ? 1 : -1; // high bit → sign
    // Sublinear TF: 1 + log2(count). count=1 → 1, count=2 → 2, count=4 → 3, ...
    const weight = sign * (1 + Math.log2(count));
    vec[bucket] += weight;
  }

  // L2 normalise.
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    const inv = 1 / norm;
    for (let i = 0; i < EMBED_DIM; i++) vec[i] *= inv;
  }
  return vec;
}

// ─── similarity ─────────────────────────────────────────────────────────────

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Vectors are pre-normalised, so dot product == cosine.
  return dot;
}

// ─── (de)serialization for DB storage ────────────────────────────────────────

/**
 * Encode a Float32Array as a compact string for DB storage.
 * Format: base64 of the underlying byte buffer. 1024 floats = 4 KB → ~5.4 KB
 * base64. For 1000 chunks that's ~5.4 MB — comfortable for SQLite.
 */
export function encodeEmbedding(vec: Float32Array): string {
  const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function decodeEmbedding(s: string): Float32Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // Copy into a fresh, aligned ArrayBuffer to avoid endianness/offset issues.
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return new Float32Array(buf);
}

// ─── retrieval ──────────────────────────────────────────────────────────────

export interface RetrievableChunk {
  id: string;
  content: string;
  section: string;
  embedding: Float32Array;
  metadata: {
    page?: number;
    level: number;
    isTitle: boolean;
    materialId: string;
    materialTitle: string;
    filename: string;
  };
}

export interface ScoredChunk {
  chunk: RetrievableChunk;
  score: number;
  /** Optional: parent section text (up to 4000 chars) for context. */
  parentSectionText?: string;
}

/**
 * Retrieve the top-K most relevant chunks for a query.
 *
 * Hybrid scoring:
 *   score = cosine(query, chunk)                 // lexical BM25-style
 *         + 0.15 * sectionBoost(chunk)           // title/abstract sections rank higher
 *         + 0.10 * isTitleBoost(chunk)           // title chunks get a small boost
 *
 * `getParentText` (optional) is called for each top-K result to fetch the
 * parent section text — kept out of the hot loop so we only fetch K parents
 * rather than all candidates'.
 */
export function retrieve(
  query: string,
  chunks: RetrievableChunk[],
  topK = 6,
  getParentText?: (chunk: RetrievableChunk) => string | undefined
): ScoredChunk[] {
  const qVec = embed(query);
  if (qVec.every((v) => v === 0) || chunks.length === 0) return [];

  const scored: ScoredChunk[] = chunks.map((c) => {
    const cos = cosineSimilarity(qVec, c.embedding);
    const sec = sectionBoost(c.section);
    const title = c.metadata.isTitle ? 0.1 : 0;
    return { chunk: c, score: cos + sec + title };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  if (getParentText) {
    for (const s of top) {
      s.parentSectionText = getParentText(s.chunk);
    }
  }

  return top;
}

function sectionBoost(sectionTitle: string): number {
  if (!sectionTitle) return 0;
  const s = sectionTitle.toLowerCase();
  // Abstract / Introduction / Summary chunks get the biggest boost — these
  // are usually the most information-dense for a learner's question.
  if (/\babstract\b|摘要/.test(s)) return 0.15;
  if (/\bintroduction\b|引言|前言/.test(s)) return 0.10;
  if (/\bconclusion\b|结论/.test(s)) return 0.08;
  if (/\bsummary\b|总结/.test(s)) return 0.06;
  // Slide 1 / title slides — modest boost.
  if (/^slide\s*1\b/.test(s)) return 0.05;
  return 0;
}

// ─── query expansion (HyDE, optional) ───────────────────────────────────────
//
// HyDE (Gao et al. 2023): for complex queries, ask the LLM to generate a
// hypothetical answer, then embed THAT for retrieval. The hypothetical answer
// lexically overlaps with relevant chunks better than the terse question.
//
// Implementation note: this requires a chat completion call, so it's only
// worth it for queries longer than ~30 chars. We expose it as a helper; the
// chat / course routes can opt-in per-call.

export async function expandQueryWithHyDE(
  query: string,
  generate: (prompt: string) => Promise<string>
): Promise<string> {
  // Short queries don't benefit from expansion.
  if (query.length < 30) return query;
  const prompt = `You are helping a retrieval system. Given the learner's question, write a 2-3 sentence hypothetical answer that would lexically overlap with relevant study material. Do not add any preamble. Just the answer.\n\nQuestion: ${query}\n\nHypothetical answer:`;
  try {
    const hyde = await generate(prompt);
    return `${query}\n\n${hyde}`;
  } catch {
    return query;
  }
}
