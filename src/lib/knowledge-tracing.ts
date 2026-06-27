import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

// ─── Knowledge Tracing Engine ───────────────────────────────────────────────
//
// Based on three 2025 papers:
//
// 1. RPKT (arXiv 2508.11892) — Recursive Prerequisite Knowledge Tracing:
//    Dynamically discover prerequisite concepts via LLM, recursively trace
//    until reaching the learner's actual knowledge boundary. No pre-defined
//    knowledge graph needed — prerequisites are discovered in real-time.
//
// 2. Dialogue KT (LAK 2025, umass-ml4ed) — Knowledge Tracing in Tutor-
//    Student Dialogues: After each dialogue turn, assess the learner's
//    mastery of each relevant knowledge node (0.0-1.0 probability).
//
// 3. Bloom Taxonomy Follow-Up Questions (ACL 2025 Industry): Generate
//    questions at 6 cognitive levels (Remember → Create), advancing when
//    the learner demonstrates competence.
//
// Integration: after each AI reply, this engine:
//   1. Assesses mastery of existing knowledge nodes from the Q&A
//   2. Discovers prerequisite chains for unmastered nodes (RPKT)
//   3. Updates bloom levels based on demonstrated cognitive depth
//   4. Enriches the system prompt with the learner's knowledge boundary

export interface MasteryAssessment {
  nodeId: string;
  nodeTitle: string;
  masteryScore: number;     // 0.0-1.0
  bloomLevel: number;       // 1-6
  demonstratedSkills: string[];
  gaps: string[];           // what the learner missed
}

export interface PrerequisiteChain {
  concept: string;
  prerequisites: string[];
  depth: number;
}

export interface KnowledgeBoundary {
  mastered: string[];
  learning: string[];
  unknown: string[];
  prerequisites: PrerequisiteChain[];
}

const BLOOM_LEVELS = [
  '记忆',   // 1: Remember
  '理解',   // 2: Understand
  '应用',   // 3: Apply
  '分析',   // 4: Analyze
  '评价',   // 5: Evaluate
  '创造',   // 6: Create
];

/**
 * Assess the learner's mastery of knowledge nodes based on the latest
 * dialogue turn. Uses LLM to evaluate the learner's response against
 * each node's expected understanding.
 *
 * Based on Dialogue KT paper — after each tutor-student exchange, we
 * estimate a mastery probability for each relevant knowledge component.
 */
export async function assessMastery(
  sessionId: string,
  userMessage: string,
  aiReply: string,
  selectedModel: string,
): Promise<MasteryAssessment[]> {
  const nodes = await db.knowledgeNode.findMany({
    where: { sessionId },
    select: { id: true, title: true, content: true, masteryScore: true, bloomLevel: true },
  });

  if (nodes.length === 0) return [];

  const zai = await ZAI.create();

  // Build assessment prompt — ask the LLM to evaluate the learner's
  // understanding of each knowledge node based on their latest message.
  const nodeList = nodes.map((n, i) =>
    `${i + 1}. ${n.title} (当前掌握度: ${n.masteryScore.toFixed(2)}, Bloom层级: ${n.bloomLevel}/6)\n   ${n.content.slice(0, 100)}`
  ).join('\n');

  const prompt = `你是知识追踪引擎。分析以下学习对话，评估学习者对每个知识点的掌握程度。

## 知识点列表
${nodeList}

## 学习者最新发言
${userMessage}

## AI 回复
${aiReply.slice(0, 1500)}

## 评估要求
对每个知识点，评估：
1. masteryScore: 0.0-1.0 的掌握概率（基于学习者在对话中展现的理解程度）
   - 0.0-0.2: 完全不理解，答非所问
   - 0.3-0.5: 有初步认识，但存在明显误解
   - 0.6-0.7: 基本理解，能正确表述核心概念
   - 0.8-1.0: 深入理解，能应用和分析
2. bloomLevel: 1-6，学习者当前达到的认知层级
   - 1=记忆(能复述) 2=理解(能解释) 3=应用(能用) 4=分析(能比较)
   - 5=评价(能批判) 6=创造(能设计新方案)
3. demonstratedSkills: 学习者展现的能力（数组）
4. gaps: 学习者的知识缺口（数组）

严格返回 JSON，不要其他文字：
{"assessments":[{"nodeTitle":"","masteryScore":0.0,"bloomLevel":1,"demonstratedSkills":[],"gaps":[]}]}`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: selectedModel,
      thinking: { type: 'disabled' },
    } as any);

    const text = completion?.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const assessments = parsed.assessments || [];

    const results: MasteryAssessment[] = [];
    for (const a of assessments) {
      const node = nodes.find(n => n.title === a.nodeTitle);
      if (!node) continue;

      const newScore = Math.max(0, Math.min(1, Number(a.masteryScore) || 0));
      const newBloom = Math.max(1, Math.min(6, Number(a.bloomLevel) || 1));
      const newMastered = newScore >= 0.7;

      // Update DB with new mastery data
      await db.knowledgeNode.update({
        where: { id: node.id },
        data: {
          masteryScore: newScore,
          bloomLevel: newBloom,
          mastered: newMastered,
          assessmentCount: { increment: 1 },
        },
      });

      results.push({
        nodeId: node.id,
        nodeTitle: node.title,
        masteryScore: newScore,
        bloomLevel: newBloom,
        demonstratedSkills: a.demonstratedSkills || [],
        gaps: a.gaps || [],
      });
    }

    return results;
  } catch (err) {
    console.error('Mastery assessment failed:', err);
    return [];
  }
}

/**
 * Discover prerequisite chains for unmastered knowledge nodes.
 *
 * Based on RPKT paper — when a learner doesn't understand a concept,
 * recursively trace its prerequisites until reaching a concept the learner
 * already knows. This discovers the "unknown unknowns" — things the learner
 * didn't know they needed to learn.
 */
export async function discoverPrerequisites(
  sessionId: string,
  unmasteredNodeTitles: string[],
  selectedModel: string,
): Promise<PrerequisiteChain[]> {
  if (unmasteredNodeTitles.length === 0) return [];

  const zai = await ZAI.create();
  const knownNodes = await db.knowledgeNode.findMany({
    where: { sessionId, mastered: true },
    select: { title: true },
  });
  const knownTitles = knownNodes.map(n => n.title);

  const prompt = `你是前置知识分析引擎。对每个学习者未掌握的概念，找出它的前置知识依赖链。

## 学习者已掌握的概念
${knownTitles.length > 0 ? knownTitles.join('、') : '（暂无已掌握的概念）'}

## 需要分析的概念
${unmasteredNodeTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## 要求
对每个概念，列出学习它之前需要先理解的前置概念（1-3个）。
- 前置概念应该是更基础的、更底层的知识
- 如果某个前置概念学习者已经掌握，标记它（在 known 字段设为 true）
- 如果前置概念学习者也没掌握，这些就是"未知的未知"——需要优先教学

返回 JSON：
{"chains":[{"concept":"","prerequisites":["概念A","概念B"]}]}`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: selectedModel,
      thinking: { type: 'disabled' },
    } as any);

    const text = completion?.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const chains = parsed.chains || [];

    // Persist prerequisites to existing nodes + create new prerequisite nodes
    const results: PrerequisiteChain[] = [];
    for (const chain of chains) {
      if (!chain.concept || !chain.prerequisites) continue;

      // Update the node's prerequisites field
      const node = await db.knowledgeNode.findFirst({
        where: { sessionId, title: chain.concept },
        select: { id: true },
      });
      if (node) {
        await db.knowledgeNode.update({
          where: { id: node.id },
          data: { prerequisites: JSON.stringify(chain.prerequisites) },
        });
      }

      // Create new prerequisite nodes that don't exist yet
      for (const prereq of chain.prerequisites) {
        const existing = await db.knowledgeNode.findFirst({
          where: { sessionId, title: prereq },
          select: { id: true },
        });
        if (!existing) {
          await db.knowledgeNode.create({
            data: {
              sessionId,
              title: prereq,
              content: `${chain.concept} 的前置知识`,
              category: 'concept',
              importance: 4,
              masteryScore: 0,
              bloomLevel: 1,
            },
          });
        }
      }

      results.push({
        concept: chain.concept,
        prerequisites: chain.prerequisites,
        depth: chain.prerequisites.length,
      });
    }

    return results;
  } catch (err) {
    console.error('Prerequisite discovery failed:', err);
    return [];
  }
}

/**
 * Build a knowledge boundary summary for the system prompt.
 *
 * This gives the AI tutor a clear picture of:
 * - What the learner has mastered (don't re-teach these)
 * - What the learner is currently learning (focus here)
 * - What prerequisites are missing (teach these first)
 * - Bloom levels for each node (ask questions at the right depth)
 */
export async function buildKnowledgeBoundaryContext(
  sessionId: string,
): Promise<string> {
  const nodes = await db.knowledgeNode.findMany({
    where: { sessionId },
    select: {
      title: true,
      masteryScore: true,
      bloomLevel: true,
      mastered: true,
      prerequisites: true,
      assessmentCount: true,
    },
  });

  if (nodes.length === 0) return '';

  const mastered = nodes.filter(n => n.mastered);
  const learning = nodes.filter(n => !n.mastered && n.masteryScore > 0);
  const unknown = nodes.filter(n => !n.mastered && n.masteryScore === 0);

  let context = '## 学习者的知识边界（实时追踪）\n\n';

  if (mastered.length > 0) {
    context += '### 已掌握（不需要再教）\n';
    mastered.forEach(n => {
      context += `- ${n.title} (掌握度: ${n.masteryScore.toFixed(2)}, Bloom: ${BLOOM_LEVELS[n.bloomLevel - 1]})\n`;
    });
    context += '\n';
  }

  if (learning.length > 0) {
    context += '### 正在学习（当前焦点）\n';
    learning.forEach(n => {
      context += `- ${n.title} (掌握度: ${n.masteryScore.toFixed(2)}, Bloom: ${BLOOM_LEVELS[n.bloomLevel - 1]}`;
      if (n.prerequisites) {
        try {
          const prereqs = JSON.parse(n.prerequisites);
          if (prereqs.length > 0) context += `, 前置: ${prereqs.join('→')}`;
        } catch {}
      }
      context += ')\n';
    });
    context += '\n';
  }

  if (unknown.length > 0) {
    context += '### 尚未触及（需要引导发现）\n';
    unknown.forEach(n => {
      context += `- ${n.title}`;
      if (n.prerequisites) {
        try {
          const prereqs = JSON.parse(n.prerequisites);
          if (prereqs.length > 0) context += ` (前置: ${prereqs.join('→')})`;
        } catch {}
      }
      context += '\n';
    });
    context += '\n';
  }

  context += '### 教学策略\n';
  context += '- 对"已掌握"的概念，不要重复讲解，可以在更高层级（分析/评价/创造）提问\n';
  context += '- 对"正在学习"的概念，在当前 Bloom 层级提问，达标后升级\n';
  context += '- 对"尚未触及"的概念，如果是对话中出现的依赖，先教前置知识再教本体\n';
  context += '- 每轮回复后，系统会自动更新掌握度，你不需要手动标注\n';
  context += '- 如果学习者掌握度 < 0.3，优先用讲解模式讲透基础\n';
  context += '- 如果学习者掌握度 0.3-0.6，用引导模式通过提问深化理解\n';
  context += '- 如果学习者掌握度 0.6-0.8，建议用练习模式巩固\n';
  context += '- 如果学习者掌握度 > 0.8，建议用复习模式间隔重复维持\n';

  return context;
}

/**
 * Recommend a teaching mode based on the learner's average mastery score.
 * Based on GIFT framework's Tutor Model — the system selects the optimal
 * instructional strategy based on learner state, rather than relying on
 * the user to manually choose.
 *
 * Returns null if no recommendation (e.g., no data yet, or current mode
 * is already optimal).
 */
export async function buildModeRecommendation(
  sessionId: string,
  currentMode: string,
): Promise<{ mode: 'guide' | 'explain' | 'practice' | 'review'; reason: string } | null> {
  const nodes = await db.knowledgeNode.findMany({
    where: { sessionId },
    select: { masteryScore: true, bloomLevel: true, mastered: true, updatedAt: true },
  });

  if (nodes.length === 0) return null;

  const avgMastery = nodes.reduce((s, n) => s + (n.masteryScore || 0), 0) / nodes.length;

  // GIFT-style strategy selection
  let recommendedMode: 'guide' | 'explain' | 'practice' | 'review';
  let reason: string;

  if (avgMastery < 0.3) {
    recommendedMode = 'explain';
    reason = `平均掌握度 ${Math.round(avgMastery * 100)}%，建议先用讲解模式建立基础理解`;
  } else if (avgMastery < 0.6) {
    recommendedMode = 'guide';
    reason = `平均掌握度 ${Math.round(avgMastery * 100)}%，建议用引导模式通过提问深化理解`;
  } else if (avgMastery < 0.8) {
    recommendedMode = 'practice';
    reason = `平均掌握度 ${Math.round(avgMastery * 100)}%，建议用练习模式巩固已学知识`;
  } else {
    // Check if any nodes are stale (> 3 days since last assessment)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const staleCount = nodes.filter(n => n.updatedAt < threeDaysAgo).length;
    if (staleCount > 0) {
      recommendedMode = 'review';
      reason = `平均掌握度 ${Math.round(avgMastery * 100)}%，有 ${staleCount} 个知识点超过 3 天未复习，建议进入复习模式`;
    } else {
      return null; // Everything is fresh and mastered — no recommendation needed
    }
  }

  // Don't recommend if already in the recommended mode
  if (recommendedMode === currentMode) return null;

  return { mode: recommendedMode, reason };
}

export { BLOOM_LEVELS };
