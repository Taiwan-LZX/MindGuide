// ────────────────────────────────────────────────────────────────────────────
// query-classifier.ts — academic intent classification for role-aware retrieval
//
// P4 of the high-precision PDF parsing pipeline.
//
// When a user asks a methodology question on an academic paper, we want chunks
// tagged `sectionRole='methods'` to rank higher; a results question should
// boost `results` chunks; a "what is X" question should lean on the
// `introduction` / `abstract`. This module classifies the query into an
// academic intent (without an LLM call — pure keyword/regex, so it stays fast
// enough to run on every retrieval), and emits the GROBID section-role boosts
// the retriever should apply.
//
// Design choices:
//   - Bilingual patterns (English + Chinese). The MindGuide audience is
//     primarily Chinese-speaking learners reading English papers, so queries
//     mix languages freely.
//   - Priority-ordered rules: more specific intents (reference / definition /
//     comparison / summary) are checked before broader ones (method / result /
//     background). First match wins, so "概述" resolves to `summary` rather
//     than `background` (both patterns list it).
//   - Two confidence tiers: 0.9 for an intent-defining keyword (e.g. "method",
//     "结果", "定义"), 0.7 for softer signals (e.g. "how does", "performance",
//     "作者"). The downstream `computeRoleBoost` scales by confidence so soft
//     matches nudge ranking without overwhelming the BM25 / tree-walk signals.
//   - No-op for empty queries and any query that matches no rule (general).
// ────────────────────────────────────────────────────────────────────────────

import type { SectionRole } from './document-chunker';

/**
 * Academic query intent.
 *
 * Each intent (except `general`) maps to a fixed set of `SectionRole` boosts.
 * The mapping is one-way: a `method` query boosts `methods` chunks, but a
 * `methods` chunk is not penalised for non-method queries — it just doesn't
 * get the boost.
 */
export type QueryIntent =
  | 'method'        // "how did they", "what method", "algorithm", "approach"
  | 'result'        // "what did they find", "results", "outcome", "performance"
  | 'background'    // "what is", "introduction", "background", "motivation"
  | 'definition'    // "define", "what does X mean", "concept"
  | 'comparison'    // "compare", "difference", "vs", "versus"
  | 'summary'       // "summarize", "overview", "main point", "abstract"
  | 'reference'     // "cite", "reference", "bibliography", "who wrote"
  | 'general';      // fallback — no boost

/**
 * Result of classifying a query.
 *
 * - `intent`: the detected academic intent (or `general` if no rule matched).
 * - `roleBoosts`: ordered list of `{ role, weight }` pairs. `weight ∈ [0,1]`
 *   expresses how strongly that section role should be favoured for this
 *   intent. The retriever turns these into additive score boosts via
 *   {@link computeRoleBoost}.
 * - `confidence ∈ [0,1]`: how sure the classifier is. Used to scale the boost
 *   so soft matches don't dominate. `0` for `general`.
 */
export interface QueryClassification {
  intent: QueryIntent;
  /** Section roles to boost (with boost weights 0.0-1.0). */
  roleBoosts: { role: SectionRole; weight: number }[];
  /** Confidence 0-1 (how sure we are about the classification). */
  confidence: number;
}

/**
 * Single classification rule: a target intent, the patterns that trigger it,
 * and the role boosts to emit on a match.
 *
 * `strongPatterns` produce confidence 0.9; `weakPatterns` produce 0.7. Strong
 * patterns are intent-defining keywords ("method", "定义"), weak patterns are
 * softer signals ("how does", "作者").
 */
interface IntentRule {
  intent: QueryIntent;
  /** Intent-defining patterns → confidence 0.9. */
  strongPatterns: RegExp[];
  /** Softer signals → confidence 0.7. */
  weakPatterns: RegExp[];
  /** Role boosts emitted on any match (strong or weak). */
  roleBoosts: { role: SectionRole; weight: number }[];
}

// ─── rule table (priority order — first match wins) ─────────────────────────
//
// More specific intents are checked before broader ones so that, e.g., a query
// containing both "定义" and "introduction" resolves to `definition` (the
// stronger signal) rather than `background`.
const INTENT_RULES: IntentRule[] = [
  // ── reference: very specific vocabulary → boost references strongly.
  {
    intent: 'reference',
    strongPatterns: [
      /\b(?:cite|citation|reference|bibliography)\b/i,
      /参考文献|引用|出处/,
    ],
    weakPatterns: [
      /\bwho wrote\b/i,
      /作者/,
    ],
    roleBoosts: [{ role: 'references', weight: 1.0 }],
  },
  // ── definition: "define X", "X 是什么意思", "概念".
  {
    intent: 'definition',
    strongPatterns: [
      /\b(?:define|definition|concept)\b/i,
      /\bwhat does\b.*\bmean\b/i,
      /定义|是什么意思|概念|含义/,
    ],
    weakPatterns: [],
    roleBoosts: [
      { role: 'introduction', weight: 0.4 },
      { role: 'methods', weight: 0.2 },
    ],
  },
  // ── comparison: "compare A vs B", "对比", "差异".
  {
    intent: 'comparison',
    strongPatterns: [
      /\b(?:compare|comparison|difference|versus|vs\.?)\b/i,
      /比较|对比|区别|差异/,
    ],
    weakPatterns: [],
    roleBoosts: [
      { role: 'results', weight: 0.5 },
      { role: 'discussion', weight: 0.4 },
    ],
  },
  // ── summary: "summarize", "总结", "概述", "摘要".
  {
    intent: 'summary',
    strongPatterns: [
      /\b(?:summarize|summary|overview|main point|abstract)\b/i,
      /总结|概述|要点|摘要|概括/,
    ],
    weakPatterns: [],
    roleBoosts: [
      { role: 'abstract', weight: 0.6 },
      { role: 'conclusion', weight: 0.5 },
    ],
  },
  // ── method: "method", "algorithm", "怎么做", "用了什么方法".
  {
    intent: 'method',
    strongPatterns: [
      /\b(?:method|methodology|algorithm|approach|implementation)\b/i,
      /怎么做|用了什么方法|算法|方法|模型架构|实验设计/,
    ],
    weakPatterns: [
      // "how does X work" / "how did they" → softer method signal.
      /\bhow\s+(?:did|does|do)\b/i,
    ],
    roleBoosts: [{ role: 'methods', weight: 0.8 }],
  },
  // ── result: "results", "实验结果", "性能", "准确率".
  {
    intent: 'result',
    strongPatterns: [
      /\b(?:result|results|outcome|finding|findings)\b/i,
      /实验结果|结果/,
    ],
    weakPatterns: [
      // Metrics-adjacent vocabulary: weaker result signal.
      /\b(?:performance|accuracy|effect)\b/i,
      /表现|性能|准确率|效果/,
    ],
    roleBoosts: [{ role: 'results', weight: 0.8 }],
  },
  // ── background: checked last — broadest, most likely to false-positive.
  {
    intent: 'background',
    strongPatterns: [
      /\b(?:introduction|background|motivation)\b/i,
      /\bwhat is\b/i,
      /是什么|介绍|背景|动机/,
    ],
    weakPatterns: [
      // "概述" is also in summary.strongPatterns; listed here for completeness
      // but summary is checked first so this branch only fires if some other
      // background strong pattern already matched (in which case weak isn't
      // reached at all). Kept to mirror the spec's pattern table verbatim.
      /概述/,
    ],
    roleBoosts: [
      { role: 'introduction', weight: 0.5 },
      { role: 'abstract', weight: 0.3 },
    ],
  },
];

/**
 * Classify a query into an academic intent + role boosts.
 *
 * Pure keyword/regex — no LLM call. Runs on every retrieval, so it must stay
 * O(query-length × pattern-count) ≈ a few microseconds.
 *
 * @param query  The raw user query (English and/or Chinese).
 * @returns A {@link QueryClassification}. `intent === 'general'` and
 *          `confidence === 0` for empty queries or queries that match no rule.
 *
 * @example
 *   classifyQuery('how does the algorithm work')
 *     // → { intent: 'method', roleBoosts: [{role:'methods', weight:0.8}], confidence: 0.9 }
 *   classifyQuery('实验结果如何')
 *     // → { intent: 'result', roleBoosts: [{role:'results', weight:0.8}], confidence: 0.9 }
 *   classifyQuery('what is deep learning')
 *     // → { intent: 'background', roleBoosts: [{introduction:0.5},{abstract:0.3}], confidence: 0.9 }
 *   classifyQuery('参考文献有哪些')
 *     // → { intent: 'reference', roleBoosts: [{role:'references', weight:1.0}], confidence: 0.9 }
 *   classifyQuery('hello')
 *     // → { intent: 'general', roleBoosts: [], confidence: 0 }
 */
export function classifyQuery(query: string): QueryClassification {
  // Empty / whitespace-only queries: no signal, no boost.
  if (!query || !query.trim()) {
    return { intent: 'general', roleBoosts: [], confidence: 0 };
  }

  // Rules are checked in priority order. First rule with a matching pattern
  // (strong preferred over weak) wins.
  for (const rule of INTENT_RULES) {
    for (const pattern of rule.strongPatterns) {
      if (pattern.test(query)) {
        return {
          intent: rule.intent,
          roleBoosts: rule.roleBoosts,
          confidence: 0.9,
        };
      }
    }
    for (const pattern of rule.weakPatterns) {
      if (pattern.test(query)) {
        return {
          intent: rule.intent,
          roleBoosts: rule.roleBoosts,
          confidence: 0.7,
        };
      }
    }
  }

  // No rule matched → general fallback (no boost, confidence 0).
  return { intent: 'general', roleBoosts: [], confidence: 0 };
}
