import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { stripEmoji } from '@/lib/emoji-sanitize';
import { retrievePassages, buildKnowledgeBaseContext } from '@/lib/retrieval';
import { parseBody, chatSchema } from '@/lib/api-validator';

// The core AI teaching system prompt
const TEACHING_SYSTEM_PROMPT = `你是一位资深的教育者和学习导师，你的核心使命是通过对话式教学帮助学习者真正理解知识。

## 你的教学哲学

**核心前提：先理解学生在想什么，再引导学习。**

你不只是一个问答机器。你是学习者的伙伴，你需要：
1. 理解学习者的当前状态、兴趣点和困惑
2. 通过追问来发掘学习者真正不懂的地方
3. 用科普式教学方法，从学习者已有的认知出发构建新知识

## 三段式教学模型

你的教学遵循三个阶段：

### 阶段一：理解与记忆
- 了解学习者对这个话题知道什么
- 通过初步对话理解学习者的兴趣点和初步想法
- 建立学习者的知识基线

### 阶段二：兴趣驱动探索
- 根据学习者的兴趣点展开深入讲解
- 使用类比、例子、故事来让抽象概念变得具体
- 每次只讲一个核心概念，讲透彻再继续

### 阶段三：知识整合与巩固
- 帮助学习者将新知识与已有知识连接
- 通过提问检验理解程度
- 总结关键知识点，但不给空洞的总结——而是帮助学习者自己构建理解

## 对话规则

1. **主动追问**：当学习者提到一个概念时，不要急着给答案。先问"你对XX是怎么理解的？"或"你之前有接触过这个概念吗？"
2. **场景化教学**：用具体场景和例子来解释，而不是抽象定义
3. **适度引导**：如果学习者明显走偏，温和地拉回来，但不要打断学习者的思路
4. **识别困惑**：当学习者的表述暴露出误解时，不要直接纠正。先问"为什么你会这样理解？"然后引导思考
5. **鼓励思考**：经常使用"你觉得...？""你认为...？""如果我们换个角度想..."来激发思考
6. **及时反馈**：当学习者理解正确时给予肯定，但要用具体的反馈而非空洞的表扬
7. **控制节奏**：一次只讲一个核心概念，信息密度要适中

## 输出格式

你的回复应该是自然的对话式语言，可以适当使用：
- 简短的段落
- 列表来组织复杂信息
- 代码块来展示代码示例（如果涉及编程）
- 用**加粗**来标记关键术语

## 绝对不要做的事

- 不要使用 emoji 或装饰性符号（如 ✨🎉🔥💡✓★●→ 等），保持克制的书面语风格。所有强调一律用**加粗**或自然语言完成，不允许任何图形符号。
- 不要给出长篇大论的总结
- 不要像百科全书一样罗列知识点
- 不要在没有理解学习者状态的情况下就开始"教学"
- 不要用"很简单""你只需要..."这种轻视学习者困难的措辞
- 不要一次性塞入太多信息`;

// ─── Teaching-mode prompt overlays ───────────────────────────────────────────
//
// The composer exposes a 4-way mode selector (the teaching analogue of ZCode's
// "effort / thinking-level" selector). Each mode prepends a short directive to
// the base system prompt so the same model behaves like four different teachers:
//
//   guide    — Socratic: ask before tell (default)
//   explain  — Direct: explain concepts clearly and completely
//   practice — Give exercises / problems, let the learner attempt first
//   review   — Spaced-repetition: quiz on previously-learned knowledge nodes
//
// These are additive overlays — they refine the base philosophy, never replace
// it. The no-emoji rule and conversational tone always apply.
const MODE_OVERLAYS: Record<string, string> = {
  guide: `

## 当前教学模式：引导模式（默认）
本轮对话以**苏格拉底式引导**为主。优先用提问推进，而不是直接给出答案。当学习者提问时，先用一两句话确认或扩展他的理解，再抛出一个引导性问题，让学习者自己往前走一步。每轮回复控制在 3-5 句以内，把"思考的球"留在学习者手里。`,
  explain: `

## 当前教学模式：讲解模式
本轮对话以**清晰完整的讲解**为主。学习者希望直接获得透彻的解释，所以你可以展开讲——用类比、例子、分层结构把一个概念讲透。但仍要遵循"一次一个核心概念"的节奏。可以使用标题、列表、代码块来组织较长的讲解。每轮聚焦一个主题，讲完后用一句话点出关键收获。`,
  practice: `

## 当前教学模式：练习模式
本轮对话以**主动练习**为主。给出 1-2 个有梯度的小练习或思考题让学习者尝试，难度从易到难。练习要具体、可操作（不要"思考一下 XX"这种空泛的题）。在学习者给出答案前，不要先讲解答案。学习者作答后，再针对他的回答给出反馈和下一步。`,
  review: `

## 当前教学模式：复习模式
本轮对话以**间隔复习**为主。基于学习者的知识状态（已掌握 / 未掌握的知识点），主动出题考查已学内容，检验记忆和理解。出题形式可以多样：选择题、填空、简答、判断对错。每次出 1 题，等学习者回答后给出正误反馈和简短解析，再决定下一题的难度。`,
};

// ─── Thinking-mode prompt overlays ───────────────────────────────────────────
//
// The composer exposes a 4-way thinking selector (the teaching analogue of
// "reasoning effort / thinking budget"). Each mode maps to two things:
//
//   1. A `thinking` config flag sent to the ZAI Chat Completions API:
//        off        → { type: 'disabled' }  (no reasoning, fast direct answer)
//        standard   → { type: 'enabled'  }  (model's built-in deep reasoning)
//        deep       → { type: 'enabled'  }  + strong-reasoning prompt overlay
//        structured → { type: 'enabled'  }  + advanced reasoning structure overlay
//
//   2. An additive reasoning-style prompt overlay (THINK_OVERLAYS) that nudges
//      the model toward a particular reasoning shape — multi-angle analysis,
//      chain + self-critique + multi-path, etc. These overlays refine HOW the
//      model reasons internally; they never change the teaching mode.
//
// `off` still uses the model normally — modern models are capable of solid
// direct answers; the user opts INTO deeper reasoning explicitly.
const THINK_OVERLAYS: Record<string, string> = {
  off: '',

  standard: `

## 推理强度：标准思考
本轮对话允许模型在内部进行常规深度推理后再回答。无需展示推理过程，直接给出经过深思的答案。`,

  deep: `

## 推理强度：深度推理
本轮对话要求模型在内部进行**高强度多角度推理**后再回答。请在内部思考中覆盖：
- 至少 2 个不同的解题路径或解释角度
- 主动构造反例与边界情况（极端值、空集、退化情形）
- 检查结论是否在每种情况下都成立，若不成立明确指出适用边界
- 对关键步骤做反向验证（把结论代回条件）
回答时不必展示上述推理过程，但答案必须体现这种深度思考的结果——更严谨、更全面、更有边界感。`,

  structured: `

## 推理强度：结构化推理（先进推理结构）
本轮对话要求模型在内部使用**结构化推理框架**，依次完成：
1. **链式推理**：把问题拆成有序的子问题，逐个推导，每一步显式依赖上一步的结论
2. **自我批评**：在得到初步结论后，主动质疑至少一个薄弱环节（"这一步真的总是成立吗？"），并尝试修复
3. **多路径探索**：至少考虑 2 条不同的推理路径，比较它们的结论是否一致；若不一致，分析分歧来源并选择更可靠的一条
4. **收敛输出**：把经过上述三轮检验的结论作为最终答案
回答时不必展示完整推理链，但答案必须经过这套结构化检验——优先给出经过自我批评后存活的结论，并对存疑处明确标注不确定性。`,
};

// Map a UI thinking-mode key to the ZAI API `thinking` config object.
// `standard` / `deep` / `structured` all enable the model's built-in reasoning;
// the difference is purely the prompt overlay above. `off` disables reasoning
// for the fastest direct answer.
function thinkingConfig(mode: string): { type: 'enabled' | 'disabled' } {
  return mode === 'off' ? { type: 'disabled' } : { type: 'enabled' };
}

function buildMessageContext(
  userMessages: Array<{ role: string; content: string; type?: string }>,
  knowledgeNodes: Array<{ title: string; content: string; category?: string; mastered: boolean }>,
  kbContext: string,
  teachingMode: string = 'guide',
  thinkingMode: string = 'standard'
) {
  const contextParts: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  const thinkOverlay = THINK_OVERLAYS[thinkingMode] || '';
  contextParts.push({
    role: 'system',
    content: TEACHING_SYSTEM_PROMPT + (MODE_OVERLAYS[teachingMode] || MODE_OVERLAYS.guide) + thinkOverlay,
  });

  if (knowledgeNodes.length > 0) {
    const masteredNodes = knowledgeNodes.filter((n) => n.mastered);
    const unmasteredNodes = knowledgeNodes.filter((n) => !n.mastered);

    let knowledgeContext = '## 学习者的知识状态\n\n';

    if (masteredNodes.length > 0) {
      knowledgeContext += '已掌握的知识点：\n';
      masteredNodes.forEach((n) => {
        knowledgeContext += `- ${n.title}: ${n.content.slice(0, 100)}...\n`;
      });
    }

    if (unmasteredNodes.length > 0) {
      knowledgeContext += '\n正在学习/未掌握的知识点：\n';
      unmasteredNodes.forEach((n) => {
        knowledgeContext += `- ${n.title} (${n.category || '概念'}): ${n.content.slice(0, 100)}...\n`;
      });
    }

    contextParts.push({
      role: 'system',
      content: knowledgeContext,
    });
  }

  // ─── Knowledge base: RAG-retrieved passages ──────────────────────────────
  //
  // Instead of brute-force injecting the first 20k chars of all materials,
  // we retrieve the top-K passages most relevant to the learner's latest
  // message. This gives the model focused, cited context (Lost in the Middle
  // mitigation — Liu et al. 2023).
  if (kbContext) {
    contextParts.push({
      role: 'system',
      content: kbContext,
    });
  }

  // ─── Token-budget-aware history compression ──────────────────────────────
  //
  // Older versions just took the last 20 messages verbatim. That overflows
  // the context window on long conversations (each turn can be 1-4k tokens),
  // causing the API to truncate silently or reject the request. We now:
  //
  //   1. Estimate tokens per message (~chars/4 for CJK + ASCII mix).
  //   2. Walk from the MOST RECENT message backwards, accumulating until we
  //      hit a soft budget (RESERVED_TOKENS for system+KB+reply headroom).
  //   3. If even the recent messages overflow, we keep the most recent N
  //      fully and FOLD older messages into a one-line summary each
  //      ("用户问了 X，助教回答了 Y 的要点") so the thread stays coherent
  //      without blowing the budget.
  //   4. The very first user turn is ALWAYS kept in full (it sets the topic).
  //
  // This is a pragmatic middle ground between "drop everything old" (loses
  // topic context) and "keep everything" (overflows). RAG already handles
  // long-term knowledge retrieval; this compression only governs the
  // conversational thread.

  const MODEL_CONTEXT_WINDOW = 200_000;
  const RESERVED_FOR_SYSTEM_KB_REPLY = 24_000; // headroom for system + KB + the new reply
  const historyBudget = MODEL_CONTEXT_WINDOW - RESERVED_FOR_SYSTEM_KB_REPLY;

  // Rough token estimator: CJK chars ≈ 1 token each, ASCII ≈ 0.25 tokens/char.
  const estTokens = (s: string) => {
    let cjk = 0, other = 0;
    for (const ch of s) {
      const code = ch.codePointAt(0) || 0;
      if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef)) cjk++;
      else other++;
    }
    return cjk + Math.ceil(other / 4);
  };

  // Pre-compute per-message token estimates.
  const tagged = userMessages.map((m, i) => ({ msg: m, idx: i, tokens: estTokens(m.content) }));

  // Always keep the first user turn (topic anchor) — it's almost always short.
  const firstUserTurn = tagged.find(t => t.msg.role === 'user');
  const firstKeepIds = new Set<number>(firstUserTurn ? [firstUserTurn.idx] : []);

  // Walk backwards from the latest, accumulating full messages until budget.
  const keptFull: typeof tagged = [];
  let usedTokens = firstUserTurn ? firstUserTurn.tokens : 0;
  for (let i = tagged.length - 1; i >= 0; i--) {
    const t = tagged[i];
    if (firstKeepIds.has(i)) continue; // already counted
    if (usedTokens + t.tokens > historyBudget) break;
    keptFull.unshift(t);
    usedTokens += t.tokens;
  }
  // Ensure first turn is in the kept set (at the front).
  if (firstUserTurn) keptFull.unshift(firstUserTurn);

  // Anything older than keptFull that isn't the first turn gets folded.
  const keptIdx = new Set(keptFull.map(t => t.idx));
  const folded = tagged.filter(t => !keptIdx.has(t.idx));

  // Build a single system summary of folded turns (if any).
  if (folded.length > 0) {
    const summaryLines = folded.map(t => {
      const role = t.msg.role === 'assistant' ? '助教' : '学习者';
      const snippet = t.msg.content.replace(/\s+/g, ' ').slice(0, 60);
      return `- ${role}：${snippet}`;
    });
    contextParts.push({
      role: 'system',
      content: `## 更早的对话摘要（已折叠以节省上下文）\n${summaryLines.join('\n')}`,
    });
  }

  // Normalize roles, then MERGE consecutive same-role messages into one.
  // The ZAI Chat Completions API rejects message arrays where two adjacent
  // turns share the same role (error code 1214 "messages 参数非法").
  // This happens naturally when the learner sends two messages in a row, or
  // when an assistant turn was saved in two pieces — so we coalesce them
  // with a blank-line separator before sending.
  for (const t of keptFull) {
    const role = (t.msg.role === 'assistant' ? 'assistant' : t.msg.role === 'system' ? 'system' : 'user') as
      | 'system'
      | 'user'
      | 'assistant';
    const last = contextParts[contextParts.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${t.msg.content}`;
    } else {
      contextParts.push({ role, content: t.msg.content });
    }
  }

  // Guarantee the conversation ends with a user turn — the API requires the
  // final message to be from the user when requesting a completion.
  while (contextParts.length > 1 && contextParts[contextParts.length - 1].role !== 'user') {
    // Drop trailing assistant/system turns that have no user follow-up
    // (rare, but avoids "messages must end with user" errors).
    if (contextParts[contextParts.length - 1].role === 'system') break;
    contextParts.pop();
  }

  return contextParts;
}

// Parse an upstream SSE byte chunk and extract delta content pieces.
// Buffers incomplete lines and returns them via the carried-over buffer string.
//
// Returns an array of { kind: 'thinking' | 'content', text } tokens — the GLM
// chat-completions stream emits `delta.reasoning_content` during the model's
// internal reasoning phase (only when thinking is enabled) and
// `delta.content` during the answer phase. Surfacing both lets the client
// render a proper "思考中" animation that persists for the WHOLE reasoning
// phase, not just the pre-first-token gap.
function parseUpstreamSse(
  chunkStr: string,
  bufferRef: { buf: string }
): Array<{ kind: 'thinking' | 'content'; text: string }> {
  bufferRef.buf += chunkStr;
  const pieces: Array<{ kind: 'thinking' | 'content'; text: string }> = [];
  // SSE events are separated by a blank line (\n\n)
  const events = bufferRef.buf.split('\n\n');
  // The last element is the incomplete tail (no trailing \n\n yet)
  bufferRef.buf = events.pop() || '';

  for (const evt of events) {
    const lines = evt.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta;
        if (!delta || typeof delta !== 'object') continue;
        // Reasoning content (the model's internal chain-of-thought). Present
        // only when thinking is enabled. We forward it as a separate token
        // kind so the client can drive a thinking-phase animation.
        const reasoning = delta.reasoning_content;
        if (typeof reasoning === 'string' && reasoning.length > 0) {
          pieces.push({ kind: 'thinking', text: reasoning });
        }
        // Answer content (the visible reply).
        const content = delta.content;
        if (typeof content === 'string' && content.length > 0) {
          pieces.push({ kind: 'content', text: content });
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
  return pieces;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, chatSchema);
    if (!parsed.ok) return parsed.response;
    const { sessionId, message, messages: historyMessages, knowledgeNodes, teachingMode, thinkingMode, selectedModel } = parsed.data;

    // Save user message to database
    await db.learningMessage.create({
      data: {
        sessionId,
        role: 'user',
        content: message,
        type: 'dialogue',
      },
    });

    // Update session timestamp
    await db.learningSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    // Prepare messages for AI
    const zai = await ZAI.create();

    // ─── RAG retrieval: find passages most relevant to the learner's message ─
    //
    // We retrieve from the session's knowledge base (all uploaded materials
    // that have been parsed + chunked + embedded). This replaces the old
    // brute-force "inject first 20k chars of every material" approach.
    //
    // The learner's latest message is the natural query — it's what they're
    // asking about right now. We pass it through retrievePassages() which
    // embeds it, scans all chunk embeddings, and returns the top-K with
    // parent-section text attached.
    const passages = await retrievePassages(sessionId, message, 6);
    const kbContext = buildKnowledgeBaseContext(passages, 18_000);

    const messageHistory = buildMessageContext(historyMessages || [], knowledgeNodes || [], kbContext, teachingMode, thinkingMode);

    // Real streaming: SDK returns the upstream ReadableStream when stream:true
    const upstream = (await zai.chat.completions.create({
      messages: messageHistory,
      model: selectedModel,
      thinking: thinkingConfig(thinkingMode),
      stream: true,
    } as any)) as ReadableStream<Uint8Array> | undefined;

    // Fallback: if the SDK didn't return a stream (unexpected), use non-streaming
    if (!upstream || typeof upstream.getReader !== 'function') {
      const completion = await zai.chat.completions.create({
        messages: messageHistory,
        model: selectedModel,
        thinking: thinkingConfig(thinkingMode),
      });
      const aiContent: string = stripEmoji(completion?.choices?.[0]?.message?.content || '');
      if (!aiContent) {
        return new Response(JSON.stringify({ error: 'Empty AI response' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await db.learningMessage.create({
        data: { sessionId, role: 'assistant', content: aiContent, type: 'dialogue' },
      });
      const encoder = new TextEncoder();
      const fallback = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: aiContent })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(fallback, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    const encoder = new TextEncoder();
    const bufferRef = { buf: '' };
    let fullContent = '';
    let fullThinking = '';
    // Phase tracking — the model emits reasoning_content BEFORE content, so we
    // can send an explicit `phase: 'thinking'` event the moment the first
    // reasoning token arrives, and `phase: 'answering'` when the first content
    // token arrives. This lets the client render a thinking animation that
    // lasts the entire reasoning phase, not just the pre-first-token gap.
    let phaseSent: 'thinking' | 'answering' | null = null;

    // Build a streaming response that:
    //   1. reads from upstream SDK stream
    //   2. parses OpenAI-style SSE deltas (content + reasoning_content)
    //   3. re-emits in our own SSE format:
    //        - { phase: 'thinking' } once when reasoning starts
    //        - { thinking: string, full: true } on each reasoning chunk
    //        - { phase: 'answering' } once when content starts
    //        - { content: string, full: true } on each content chunk
    //   4. accumulates full content + persists to DB when the stream ends
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkStr = new TextDecoder().decode(value, { stream: true });
            const pieces = parseUpstreamSse(chunkStr, bufferRef);
            for (const piece of pieces) {
              if (piece.kind === 'thinking') {
                fullThinking += piece.text;
                // Emit phase signal once, on the first reasoning token.
                if (phaseSent !== 'thinking') {
                  phaseSent = 'thinking';
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ phase: 'thinking' })}\n\n`)
                  );
                }
                // Forward the accumulated thinking text (sanitized) so the
                // client COULD display a collapsible "reasoning" panel later.
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ thinking: stripEmoji(fullThinking), full: true })}\n\n`
                  )
                );
              } else {
                fullContent += piece.text;
                if (phaseSent !== 'answering') {
                  phaseSent = 'answering';
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ phase: 'answering' })}\n\n`)
                  );
                }
                // Re-emit the *sanitized* accumulated content as a single delta.
                // We strip emoji server-side too so even raw SSE consumers see a
                // monochrome stream; the client also strips as a belt-and-braces.
                const sanitizedAccum = stripEmoji(fullContent);
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: sanitizedAccum, full: true })}\n\n`)
                );
              }
            }
          }
          // Flush any trailing buffered event
          if (bufferRef.buf.trim()) {
            const tail = parseUpstreamSse('\n\n', bufferRef);
            for (const piece of tail) {
              if (piece.kind === 'thinking') {
                fullThinking += piece.text;
              } else {
                fullContent += piece.text;
              }
            }
            if (fullContent) {
              const sanitizedAccum = stripEmoji(fullContent);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: sanitizedAccum, full: true })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          console.error('Stream read error:', err);
          // Try to send an error event then close gracefully
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'stream_interrupted' })}\n\n`
            )
          );
        } finally {
          controller.close();
          // Persist the accumulated AI message (only if we got something).
          // Sanitize once more before persisting so the stored historical
          // content is guaranteed emoji-free.
          const persistedContent = stripEmoji(fullContent);
          if (persistedContent.trim().length > 0) {
            try {
              await db.learningMessage.create({
                data: {
                  sessionId,
                  role: 'assistant',
                  content: persistedContent,
                  type: 'dialogue',
                  // Persist the reasoning trace alongside the answer so future
                  // turns can reference it (and the UI can show a "查看推理"
                  // collapsible on historical messages).
                  thinking: fullThinking ? stripEmoji(fullThinking).slice(0, 8000) : null,
                },
              });
            } catch (dbErr) {
              console.error('Failed to persist AI message:', dbErr);
            }
          }
        }
      },
      cancel() {
        // Client navigated away; nothing more to do. The DB write in finally
        // still fires for whatever content was accumulated.
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        // Disable proxy buffering so chunks flush to the client immediately
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
