// ────────────────────────────────────────────────────────────────────────────
// role-boost.ts — apply GROBID section-role boosts to scored retrieval results
//
// P4 of the high-precision PDF parsing pipeline.
//
// After BM25 + tree-walk fusion, the retriever has a coarse ranking. For
// academic papers, we can sharpen it: if the user asked a methodology
// question, chunks tagged `sectionRole='methods'` should rank higher; a
// results question should boost `results` chunks; and so on.
//
// This module computes a single additive boost ∈ [0, 0.4] per chunk based on:
//   - the chunk's `sectionRole` (GROBID taxonomy, set by the chunker), and
//   - the classified query intent + role-weight table (see query-classifier).
//
// The 0.4 cap is deliberate — BM25 / tree-walk are the primary signals, and
// role boost is a re-rank nudge, not a replacement. With max weight=1.0 and
// max confidence=0.9, the effective max boost is 1.0 × 0.9 × 0.4 = 0.36,
// which sits comfortably below a typical BM25 hit (≈ 1-3) and just above the
// 0.3 base score that tree-walk-only candidates get.
// ────────────────────────────────────────────────────────────────────────────

import type { QueryClassification } from './query-classifier';
import type { SectionRole } from './document-chunker';

/**
 * Compute a boost score for a chunk based on its `sectionRole` and the
 * classified query intent.
 *
 * The boost is additive (added to the chunk's existing retrieval score, after
 * BM25 + tree-walk fusion but before the keyword-boost pass). It is:
 *   - `0` for chunks without a `sectionRole` (non-academic / legacy v1 chunks),
 *   - `0` for `general`-intent queries (no rule matched),
 *   - `0` for chunks whose role isn't in the classification's boost table,
 *   - otherwise `min(weight × confidence × 0.4, 0.4)`.
 *
 * @param sectionRole      The chunk's GROBID section role
 *                         (`abstract` / `introduction` / `methods` / `results`
 *                         / `discussion` / `conclusion` / `references` /
 *                         `appendix`). `undefined` for non-academic materials
 *                         or pre-v1 chunks.
 * @param classification   The classified query intent + role-boost table
 *                         (see {@link classifyQuery}).
 * @returns                Boost value to ADD to the chunk's retrieval score.
 *                         Always in `[0, 0.4]`.
 *
 * @example
 *   computeRoleBoost('methods',
 *     { intent: 'method',
 *       roleBoosts: [{ role: 'methods', weight: 0.8 }],
 *       confidence: 0.9 })
 *     // → 0.288  (= 0.8 × 0.9 × 0.4)
 *
 *   computeRoleBoost('introduction',
 *     { intent: 'method',
 *       roleBoosts: [{ role: 'methods', weight: 0.8 }],
 *       confidence: 0.9 })
 *     // → 0  (introduction not in the method intent's boost table)
 *
 *   computeRoleBoost(undefined, anyClassification)
 *     // → 0  (non-academic chunk)
 *
 *   computeRoleBoost('methods',
 *     { intent: 'general', roleBoosts: [], confidence: 0 })
 *     // → 0  (general query → no boost)
 */
export function computeRoleBoost(
  sectionRole: string | undefined,
  classification: QueryClassification
): number {
  // No role on the chunk (non-academic material, or a v1 chunk that predates
  // the sectionRole column) → nothing to boost.
  if (!sectionRole) return 0;

  // General queries have no intent → no role preference → no boost.
  if (classification.intent === 'general') return 0;

  // Look up this role in the classification's boost table. Roles not listed
  // for the current intent get no boost (e.g. an `introduction` chunk under a
  // `method`-intent query).
  const boost = classification.roleBoosts.find((r) => r.role === (sectionRole as SectionRole));
  if (!boost) return 0;

  // Scale by confidence (soft matches nudge less) and a 0.4 magnitude factor
  // so role boost never dominates BM25 / tree-walk. Cap at 0.4 defensively.
  return Math.min(boost.weight * classification.confidence * 0.4, 0.4);
}
