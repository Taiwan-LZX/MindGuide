import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

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
- 用emoji来增加亲和力（适度使用）

## 绝对不要做的事

- 不要给出长篇大论的总结
- 不要像百科全书一样罗列知识点
- 不要在没有理解学习者状态的情况下就开始"教学"
- 不要用"很简单""你只需要..."这种轻视学习者困难的措辞
- 不要一次性塞入太多信息`;

function buildMessageContext(
  userMessages: Array<{ role: string; content: string; type?: string }>,
  knowledgeNodes: Array<{ title: string; content: string; category?: string; mastered: boolean }>
) {
  const contextParts: Array<{ role: string; content: string }> = [];

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

  const maxHistoryMessages = 20;
  const trimmedMessages = userMessages.slice(-maxHistoryMessages);

  for (const msg of trimmedMessages) {
    contextParts.push({
      role: msg.role,
      content: msg.content,
    });
  }

  return contextParts;
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message, messages: historyMessages, knowledgeNodes } = await req.json();

    if (!sessionId || !message) {
      return new Response(JSON.stringify({ error: 'sessionId and message are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
    const messageHistory = buildMessageContext(historyMessages || [], knowledgeNodes || []);

    // Get AI completion (non-streaming first for reliability)
    const completion = await zai.chat.completions.create({
      messages: messageHistory,
      thinking: { type: 'disabled' },
    });

    const aiContent = completion.choices?.[0]?.message?.content || '';

    if (!aiContent) {
      return new Response(JSON.stringify({ error: 'Empty AI response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save AI message to database
    await db.learningMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: aiContent,
        type: 'dialogue',
      },
    });

    // Stream the response back to client using SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send content in chunks to simulate streaming
        const chunkSize = 8;
        let i = 0;
        const sendChunk = () => {
          while (i < aiContent.length) {
            const chunk = aiContent.slice(i, i + chunkSize);
            i += chunkSize;
            const data = JSON.stringify({ content: chunk });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        };
        // Use setTimeout to yield between chunks for visual streaming effect
        if (aiContent.length <= 200) {
          // Short response: send all at once
          const data = JSON.stringify({ content: aiContent });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } else {
          // Longer response: stream in chunks
          sendChunk();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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
