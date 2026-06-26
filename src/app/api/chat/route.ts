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

function buildMessageContext(
  userMessages: Array<{ role: string; content: string; type?: string }>,
  knowledgeNodes: Array<{ title: string; content: string; category?: string; mastered: boolean }>,
  kbContext: string
) {
  const contextParts: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  contextParts.push({
    role: 'system',
    content: TEACHING_SYSTEM_PROMPT,
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

  const maxHistoryMessages = 20;
  const trimmedMessages = userMessages.slice(-maxHistoryMessages);

  for (const msg of trimmedMessages) {
    // Normalize: the client may send type-tagged messages; only role+content matter for the model
    const role = (msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user') as
      | 'system'
      | 'user'
      | 'assistant';
    contextParts.push({ role, content: msg.content });
  }

  return contextParts;
}

// Parse an upstream SSE byte chunk and extract delta content pieces.
// Buffers incomplete lines and returns them via the carried-over buffer string.
function parseUpstreamSse(
  chunkStr: string,
  bufferRef: { buf: string }
): string[] {
  bufferRef.buf += chunkStr;
  const pieces: string[] = [];
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
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          pieces.push(delta);
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
    const { sessionId, message, messages: historyMessages, knowledgeNodes } = parsed.data;

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

    const messageHistory = buildMessageContext(historyMessages || [], knowledgeNodes || [], kbContext);

    // Real streaming: SDK returns the upstream ReadableStream when stream:true
    const upstream = (await zai.chat.completions.create({
      messages: messageHistory,
      thinking: { type: 'disabled' },
      stream: true,
    } as any)) as ReadableStream<Uint8Array> | undefined;

    // Fallback: if the SDK didn't return a stream (unexpected), use non-streaming
    if (!upstream || typeof upstream.getReader !== 'function') {
      const completion = await zai.chat.completions.create({
        messages: messageHistory,
        thinking: { type: 'disabled' },
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

    // Build a streaming response that:
    //   1. reads from upstream SDK stream
    //   2. parses OpenAI-style SSE deltas
    //   3. re-emits in our own SSE format ({content: string})
    //   4. accumulates full content and persists to DB when the stream ends
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
              fullContent += piece;
            }
            // Re-emit the *sanitized* accumulated content as a single delta.
            // We strip emoji server-side too so even raw SSE consumers see a
            // monochrome stream; the client also strips as a belt-and-braces.
            const sanitizedAccum = stripEmoji(fullContent);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: sanitizedAccum, full: true })}\n\n`)
            );
          }
          // Flush any trailing buffered event
          if (bufferRef.buf.trim()) {
            const tail = parseUpstreamSse('\n\n', bufferRef);
            for (const piece of tail) {
              fullContent += piece;
            }
            const sanitizedAccum = stripEmoji(fullContent);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: sanitizedAccum, full: true })}\n\n`)
            );
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
