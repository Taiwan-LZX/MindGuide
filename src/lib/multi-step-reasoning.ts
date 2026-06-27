import ZAI from 'z-ai-web-dev-sdk';
import { stripEmoji } from '@/lib/emoji-sanitize';
import { retrievePassages, buildKnowledgeBaseContext } from '@/lib/retrieval';

// ─── Multi-Step Reasoning Engine ────────────────────────────────────────────
//
// Phase 2: turns `thinkingMode: deep/structured` from a prompt overlay into
// a REAL multi-step reasoning pipeline. Each step calls the model separately,
// produces an intermediate result, and feeds it into the next step. The
// final step streams the answer to the user.
//
// Pipeline:
//   • standard/off → single-step (existing behavior, no change)
//   • deep         → 3 steps: analyze → reason → answer
//   • structured   → 4 steps: chain → critique → multi-path → converge
//
// Each intermediate step is emitted as an SSE { step } event so the frontend
// Reasoning panel can show "Step 1/N: Analyzing..." with live progress.
// The final step streams { content } + { thinking } as before.

export interface ReasoningStep {
  index: number;
  total: number;
  label: string;
  result: string;
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
  finalContent: string;
  finalThinking: string;
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

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Run a multi-step reasoning pipeline for `deep` / `structured` modes.
 * Returns intermediate steps + final streaming response.
 *
 * For `off` / `standard` modes, returns null (caller should use the
 * existing single-step streaming path).
 */
export async function runMultiStepReasoning(
  config: MultiStepConfig,
  onStep: (step: ReasoningStep) => void,
): Promise<{ steps: ReasoningStep[]; finalThinking: string } | null> {
  const { mode } = config;
  if (mode === 'off' || mode === 'standard') return null;

  const stepDefs = mode === 'deep' ? DEEP_STEPS : STRUCTURED_STEPS;
  const zai = await ZAI.create();
  const steps: ReasoningStep[] = [];
  let accumulatedContext = '';

  // RAG retrieval for the first step (analysis benefits from KB context)
  const passages = await retrievePassages(config.sessionId, config.message, 4);
  const kbContext = buildKnowledgeBaseContext(passages, 12_000);

  for (let i = 0; i < stepDefs.length - 1; i++) {
    const stepDef = stepDefs[i];
    const step: ReasoningStep = {
      index: i,
      total: stepDefs.length,
      label: stepDef.label,
      result: '',
    };

    // Build messages for this step
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: `你是 MindGuide 的内部推理引擎。当前执行第 ${i + 1}/${stepDefs.length} 步：${stepDef.label}。

学习者的原始问题：${config.message}

${i > 0 ? `前序步骤结果：\n${accumulatedContext}` : '（这是第一步）'}

${i === 0 && kbContext ? `\n知识库参考：\n${kbContext}` : ''}

${stepDef.prompt}`,
      },
      { role: 'user', content: config.message },
    ];

    try {
      const completion = await zai.chat.completions.create({
        messages,
        model: config.selectedModel,
        thinking: { type: 'enabled' },
      } as any);

      const result = stripEmoji(completion?.choices?.[0]?.message?.content || '');
      const thinking = stripEmoji(completion?.choices?.[0]?.message?.reasoning_content || '');

      step.result = result;
      steps.push(step);
      accumulatedContext += `\n\n### ${stepDef.label}\n${result}${thinking ? `\n（推理：${thinking}）` : ''}`;
      onStep(step);
    } catch (err) {
      console.error(`Step ${i + 1} (${stepDef.label}) failed:`, err);
      step.result = `（步骤执行失败）`;
      steps.push(step);
      onStep(step);
    }
  }

  // The last step is handled by the caller (streamed to the user).
  // We return the accumulated context + steps so the caller can feed it
  // into the final streaming call.
  return {
    steps,
    finalThinking: accumulatedContext,
  };
}

/**
 * Build the enhanced system prompt for the final streaming step, including
 * the multi-step reasoning context so the model's answer reflects the
 * intermediate analysis.
 */
export function buildEnhancedSystemPrompt(
  basePrompt: string,
  multiStepContext: string | null,
  mode: 'off' | 'standard' | 'deep' | 'structured',
): string {
  if (!multiStepContext) return basePrompt;

  const modeLabel = mode === 'deep' ? '深度推理' : '结构化推理';
  return `${basePrompt}

## ${modeLabel}上下文

你已经完成了多步推理，以下是中间步骤的结果。最终回答必须基于这些推理结果，体现其严谨性和边界感。

${multiStepContext}

## 回答要求
- 答案必须体现上述推理的结论
- 对存疑处明确标注不确定性
- 保持苏格拉底式引导风格`;
}
