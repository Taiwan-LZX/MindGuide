// ────────────────────────────────────────────────────────────────────────────
// retrieval-boosts.ts — shared re-ranking boosts for retrieval & global search
//
// Extracted from retrieval.ts so the global search service can reuse the same
// role-boost + semantic-keyword + CJK-short-query logic without duplicating it.
// Both retrievePassages() (chat context) and globalSearch() (unified search)
// call these helpers, guaranteeing consistent re-ranking across surfaces.
// ────────────────────────────────────────────────────────────────────────────

import { tokenize, type ScoredChunk } from './text-embedding';
import { classifyQuery } from './query-classifier';
import { computeRoleBoost } from './role-boost';

export interface ChunkV2Fields {
  blockType?: string;
  sectionPath?: string;
  sectionRole?: string;
  bbox?: [number, number, number, number];
}

/**
 * Apply GROBID section-role boost to scored chunks (mutates in place).
 *
 * No-op for non-academic materials (no sectionRole) and `general`-intent
 * queries (no rule matched → computeRoleBoost returns 0).
 */
export function applyRoleBoosts(
  scored: ScoredChunk[],
  v2FieldsByChunkId: Map<string, ChunkV2Fields>,
  query: string
): void {
  const classification = classifyQuery(query);
  if (classification.intent === 'general') return;
  for (const s of scored) {
    const v2 = v2FieldsByChunkId.get(s.chunk.id);
    const boost = computeRoleBoost(v2?.sectionRole, classification);
    if (boost > 0) s.score += boost;
  }
}

/**
 * Apply semantic keyword + CJK short-query substring boosts.
 * Returns a NEW sorted array (does not mutate input). Caps: keyword +0.36,
 * CJK +0.50.
 *
 * Expects each chunk to optionally carry a `keywords` array (LLM-generated)
 * on the chunk object — attached by the caller when building RetrievableChunk[].
 */
export function applyLexicalBoosts(scored: ScoredChunk[], query: string): ScoredChunk[] {
  const queryTokens = new Set(tokenize(query.toLowerCase()));
  const queryText = query.toLowerCase();

  // ── CJK short-query detection ────────────────────────────────────────────
  // BM25 hashed TF-IDF produces extremely sparse vectors for short CJK queries
  // (a 4-char query → 3 bigrams → cosine ~0.17 for a perfect match). We
  // compensate with a direct substring boost.
  const cjkCharCount = (query.match(/\p{Script=Han}/gu) || []).length;
  const isShortCjkQuery =
    query.trim().length >= 2 &&
    query.trim().length <= 12 &&
    cjkCharCount / Math.max(query.trim().length, 1) > 0.5;
  const queryTrimmedLower = query.trim().toLowerCase();
  const queryCjkBigrams: string[] = [];
  if (isShortCjkQuery) {
    const hanRuns = query.match(/\p{Script=Han}+/gu) || [];
    for (const run of hanRuns) {
      for (let i = 0; i < run.length - 1; i++) {
        queryCjkBigrams.push(run.slice(i, i + 2));
      }
    }
  }

  const boosted = scored.map((s) => {
    const extra = s.chunk as ScoredChunk['chunk'] & { keywords?: string[] };
    const kws = extra.keywords ?? [];

    // Semantic keyword boost: +0.12 for substring match, +0.08 for token overlap.
    let kwBoost = 0;
    for (const kw of kws) {
      const kwLower = kw.toLowerCase();
      if (queryText.includes(kwLower)) {
        kwBoost += 0.12;
        continue;
      }
      const kwTokens = tokenize(kwLower);
      if (kwTokens.length > 0 && kwTokens.every((t) => queryTokens.has(t))) {
        kwBoost += 0.08;
      }
    }

    // CJK short-query substring boost: +0.40 exact phrase, +0.10×ratio partial.
    let cjkBoost = 0;
    if (isShortCjkQuery && queryTrimmedLower.length >= 2) {
      const contentLower = s.chunk.content.toLowerCase();
      if (contentLower.includes(queryTrimmedLower)) {
        cjkBoost += 0.4;
      } else if (queryCjkBigrams.length > 0) {
        let matched = 0;
        for (const bg of queryCjkBigrams) {
          if (contentLower.includes(bg)) matched++;
        }
        cjkBoost += 0.1 * (matched / queryCjkBigrams.length);
      }
    }

    return { ...s, score: s.score + Math.min(kwBoost, 0.36) + Math.min(cjkBoost, 0.5) };
  });
  boosted.sort((a, b) => b.score - a.score);
  return boosted;
}

/**
 * Build a display snippet (~maxLen chars) centered on the first query match.
 * Collapses whitespace. Adds ellipses when truncated.
 *
 * @returns snippet text + relative match offsets (for highlight rendering).
 *          matchStart === -1 when no match found.
 */
export function buildSnippet(
  content: string,
  query: string,
  maxLen = 140
): { snippet: string; matchStart: number; matchEnd: number } {
  if (!content) return { snippet: '', matchStart: -1, matchEnd: -1 };
  const clean = content.replace(/\s+/g, ' ').trim();
  if (!query) {
    const snippet = clean.slice(0, maxLen) + (clean.length > maxLen ? '…' : '');
    return { snippet, matchStart: -1, matchEnd: -1 };
  }

  const tryMatch = (needle: string): number => {
    if (!needle || needle.length < 2) return -1;
    return clean.toLowerCase().indexOf(needle.toLowerCase());
  };

  let idx = tryMatch(query);
  let matchLen = query.length;
  if (idx === -1) {
    // Fall back to the first query token (≥2 chars) that appears in content.
    const toks = tokenize(query.toLowerCase()).filter((t) => t.length >= 2);
    for (const t of toks) {
      const ti = tryMatch(t);
      if (ti !== -1) {
        idx = ti;
        matchLen = t.length;
        break;
      }
    }
  }

  if (idx === -1) {
    const snippet = clean.slice(0, maxLen) + (clean.length > maxLen ? '…' : '');
    return { snippet, matchStart: -1, matchEnd: -1 };
  }

  const half = Math.max(0, Math.floor((maxLen - matchLen) / 2));
  let start = Math.max(0, idx - half);
  const end = Math.min(clean.length, start + maxLen);
  start = Math.max(0, end - maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  const snippet = prefix + clean.slice(start, end) + suffix;
  const relStart = idx - start + prefix.length;
  return { snippet, matchStart: relStart, matchEnd: relStart + matchLen };
}
