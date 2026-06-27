import ZAI from 'z-ai-web-dev-sdk';
import { stripEmoji } from '@/lib/emoji-sanitize';
import { retrievePassages, type RetrievedPassage } from '@/lib/retrieval';

// ─── Multi-Step Reasoning Engine ────────────────────────────────────────────
//
// Phase 2: turns `thinkingMode: deep/structured` from a prompt overlay into
// a REAL multi-step reasoning pipeline. Each step calls the model separately,
// produces an intermediate result, and feeds it into the next step. The
// final step streams the answer to the user.
//
// Phase 3 improvements:
//   • Intermediate steps now STREAM their output (token-by-token) instead of
//     waiting for the full completion. Each token is forwarded via onStepToken.
//   • Citation mode: RAG passages get [1], [2], ... IDs that the model can
//     reference in its answer. Citations are returned for frontend rendering.
//   • Per-step retry: if a step fails, it's retried once before giving up.
//   • Metrics: step count, total duration, per-step duration are tracked.
//
// Pipeline:
//   • standard/off → single-step (existing behavior, no change)
//   • deep         → 3 steps: analyze → reason → answer
//   • structured   → 4 steps: chain → critique → multi-path → converge
//
// Each intermediate step is emitted as an SSE { stepStart } event when it
// begins, { stepToken } events as tokens stream in, and a final { step }
// event with the complete result when the step finishes.

export interface ReasoningStep {
  index: number;
  total: number;
  label: string;
  result: string;
  durationMs?: number;
}

export interface ReasoningMetrics {
  totalDurationMs: number;
  stepCount: number;
  stepDurations: number[];
  citations: CitationRef[];
}

export interface CitationRef {
  id: number;
  materialTitle: string;
  section: string;
  page?: number;
  content: string;
}

export interface MultiStepConfig {
  mode: 'off' | 'standard' | 'deep' | 'structured';
  sessionId: string;
  message: string;
  messageHistory: Array<{ role: string; content: string; type?: string }>;
  knowledgeNodes: Array<{ title: string; content: string; category?: string; mastered: boolean }>;
  teachingMode: string;
  selectedModel: string;
}

export interface MultiStepResult {
  steps: ReasoningStep[];
  finalThinking: string;
  metrics: ReasoningMetrics;
  citations: CitationRef[];
}

// ─── Step prompts ───────────────────────────────────────────────────────────

const DEEP_STEPS = [
  {
    label: '分析问题',
    prompt: `你是一个学习分析专家。请分析以下学习者的问题，输出：
1. 问题类型（概念理解/应用/对比/排错/其他）
2. 学习者可能的认知水平（基于问题表述推断）
3. 需要检索的核心知识点
4. 潜在的认知盲区

只输出分析结果，不要回答问题本身。简洁扼要，200字以内。`,
  },
  {
    label: '深度推理',
    prompt: `基于上述分析，请进行深度推理：
1. 从多个角度思考问题（至少 2 个角度）
2. 对每个角度给出初步结论
3. 检查结论的边界条件（什么情况下不成立）
4. 反向验证：把结论代回条件是否自洽

输出推理过程，300字以内。不要给出最终答案。`,
  },
  {
    label: '组织回答',
    prompt: `基于分析和推理结果，现在给出最终回答。遵循苏格拉底式教学原则——通过追问引导学习者自己思考，而非直接给答案。回答要体现深度推理的严谨性和边界感。`,
  },
];

const STRUCTURED_STEPS = [
  {
    label: '链式推理',
    prompt: `你是一个推理工程师。请对学习者的问题进行链式推理：
1. 把问题拆成有序的子问题
2. 逐个推导，每一步显式依赖上一步的结论
3. 记录推理链中的关键节点

输出链式推理过程，300字以内。不要给出最终答案。`,
  },
  {
    label: '自我批评',
    prompt: `现在对上述链式推理进行自我批评：
1. 找出推理链中最薄弱的环节
2. 质疑："这一步真的总是成立吗？"
3. 如果发现问题，尝试修复
4. 评估修复后推理链的可靠性

输出批评结果，200字以内。`,
  },
  {
    label: '多路径探索',
    prompt: `请探索至少 2 条不同的推理路径来回答同一个问题：
- 路径 A：[第一条推理路径，从某个角度切入]
- 路径 B：[第二条推理路径，从不同角度切入]
- 比较两条路径的结论是否一致
- 若不一致，分析分歧来源

输出多路径分析，300字以内。`,
  },
  {
    label: '收敛输出',
    prompt: `基于经过自我批评和多路径验证的推理结果，给出最终答案。优先给出经过检验后存活的结论，对存疑处明确标注不确定性。遵循引导式教学风格。`,
  },
];

// ─── Citation helpers ───────────────────────────────────────────────────────

/**
 * Build a citation-tagged knowledge base context. Each passage gets a [1],
 * [2], ... prefix so the model can reference them in its answer. The
 * citations array is returned so the frontend can render clickable refs.
 */
function buildCitedContext(
  passages: RetrievedPassage[],
  maxChars = 12_000,
): { context: string; citations: CitationRef[] } {
  if (passages.length === 0) return { context: '', citations: [] };

  const citations: CitationRef[] = [];
  const parts: string[] = [];
  let used = 0;

  passages.forEach((p, idx) => {
    if (used >= maxChars) return;
    const remaining = maxChars - used;
    const content = p.content.length > remaining ? p.content.slice(0, remaining) + '…' : p.content;
    const citeId = idx + 1;
    const citationTag = `[${citeId}]`;
    parts.push(`${citationTag} ${content}`);
    citations.push({
      id: citeId,
      materialTitle: p.materialTitle,
      section: p.section || '',
      page: p.page,
      content: p.content.slice(0, 200),
    });
    used += content.length + citationTag.length + 2;
  });

  const context = `## 学习者导入的资料（基于检索的相关片段）

以下是从学习者导入的学习资料中检索到的、与当前问题最相关的片段。每个片段前有 [编号] 标记。在回答时，如引用某片段的内容，请在对应处标注 [编号]。

${parts.join('\n\n---\n\n')}
`;
  return { context, citations };
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Run a multi-step reasoning pipeline for `deep` / `structured` modes.
 *
 * Phase 3: intermediate steps now STREAM their output via onStepToken.
 * Each step also gets a retry on failure. Metrics are tracked.
 *
 * For `off` / `standard` modes, returns null (caller uses single-step).
 */
export async function runMultiStepReasoning(
  config: MultiStepConfig,
  onStep: (step: ReasoningStep) => void,
  onStepStart?: (index: number, total: number, label: string) => void,
  onStepToken?: (index: number, token: string) => void,
): Promise<{ steps: ReasoningStep[]; finalThinking: string; metrics: ReasoningMetrics; citations: CitationRef[] } | null> {
  const { mode } = config;
  if (mode === 'off' || mode === 'standard') return null;

  const stepDefs = mode === 'deep' ? DEEP_STEPS : STRUCTURED_STEPS;
  const zai = await ZAI.create();
  const steps: ReasoningStep[] = [];
  let accumulatedContext = '';
  const stepDurations: number[] = [];
  const pipelineStart = Date.now();

  // RAG retrieval with citation tagging
  const passages = await retrievePassages(config.sessionId, config.message, 4);
  const { context: kbContext, citations } = buildCitedContext(passages, 12_000);

  for (let i = 0; i < stepDefs.length - 1; i++) {
    const stepDef = stepDefs[i];
    const stepStart = Date.now();

    // Notify: step is starting (frontend shows "Step i/N: Label..." indicator)
    if (onStepStart) onStepStart(i, stepDefs.length, stepDef.label);

    // Build messages for this step
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: `你是 MindGuide 的内部推理引擎。当前执行第 ${i + 1}/${stepDefs.length} 步：${stepDef.label}。

学习者的原始问题：${config.message}

${i > 0 ? `前序步骤结果：\n${accumulatedContext}` : '（这是第一步）'}

${i === 0 && kbContext ? `\n${kbContext}` : ''}

${stepDef.prompt}`,
      },
      { role: 'user', content: config.message },
    ];

    let result = '';
    let thinking = '';
    let success = false;

    // Phase 3: retry once on failure
    for (let attempt = 0; attempt < 2 && !success; attempt++) {
      try {
        // Phase 3: stream the intermediate step so tokens arrive live
        const upstream = (await zai.chat.completions.create({
          messages,
          model: config.selectedModel,
          thinking: { type: 'enabled' },
          stream: true,
        } as any)) as ReadableStream<Uint8Array> | undefined;

        if (upstream && typeof upstream.getReader === 'function') {
          // Streaming path — parse SSE deltas and forward tokens
          const reader = upstream.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let stepContent = '';
          let stepThinking = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const evt of events) {
              const line = evt.split('\n').find(l => l.trim().startsWith('data:'));
              if (!line) continue;
              const data = line.trim().slice(5).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta;
                if (!delta) continue;
                if (typeof delta.content === 'string' && delta.content) {
                  stepContent += delta.content;
                  // Forward token to frontend for live display
                  if (onStepToken) onStepToken(i, delta.content);
                }
                if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
                  stepThinking += delta.reasoning_content;
                }
              } catch { /* skip malformed */ }
            }
          }
          result = stripEmoji(stepContent);
          thinking = stripEmoji(stepThinking);
        } else {
          // Fallback: non-streaming
          const completion = await zai.chat.completions.create({
            messages,
            model: config.selectedModel,
            thinking: { type: 'enabled' },
          } as any);
          result = stripEmoji(completion?.choices?.[0]?.message?.content || '');
          thinking = stripEmoji(completion?.choices?.[0]?.message?.reasoning_content || '');
          // Forward the full result as one "token"
          if (onStepToken) onStepToken(i, result);
        }

        success = true;
      } catch (err) {
        if (attempt === 0) {
          console.warn(`Step ${i + 1} (${stepDef.label}) failed, retrying...`, err);
        } else {
          console.error(`Step ${i + 1} (${stepDef.label}) failed after retry:`, err);
          result = `（步骤执行失败）`;
        }
      }
    }

    const durationMs = Date.now() - stepStart;
    stepDurations.push(durationMs);

    const step: ReasoningStep = {
      index: i,
      total: stepDefs.length,
      label: stepDef.label,
      result,
      durationMs,
    };
    steps.push(step);
    accumulatedContext += `\n\n### ${stepDef.label}\n${result}${thinking ? `\n（推理：${thinking}）` : ''}`;
    onStep(step);
  }

  const totalDurationMs = Date.now() - pipelineStart;

  return {
    steps,
    finalThinking: accumulatedContext,
    metrics: {
      totalDurationMs,
      stepCount: steps.length,
      stepDurations,
      citations,
    },
    citations,
  };
}

