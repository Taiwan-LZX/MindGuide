import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const COURSE_GENERATION_PROMPT = `你是一位资深的教育课程设计师。根据学习者的对话记录和已有知识点，分析学习者的理解程度和知识盲区，然后生成一套结构化的学习课程。

## 任务

1. 分析学习者在对话中展现出的知识水平
2. 识别学习者的知识盲区和薄弱环节
3. 生成 3-4 个学习模块，每个模块包含 4-6 个课时
4. 每个课时需包含理论、练习或测验内容
5. 根据难度合理设置预计时长

## 输出格式

严格返回以下 JSON 格式，不要包含任何其他文字说明：
{
  "modules": [
    {
      "id": "mod-1",
      "sessionId": "session-id",
      "title": "模块标题",
      "order": 1,
      "lessons": [
        {
          "id": "les-1-1",
          "moduleId": "mod-1",
          "title": "课时标题",
          "type": "theory",
          "duration": "10分钟",
          "status": "available",
          "content": "课时的详细内容描述，包括要讲解的核心概念和要点",
          "order": 1
        }
      ]
    }
  ]
}

## 规则

- 第一个模块的第一个课时 status 设为 "available"，其余全部设为 "locked"
- type 只能是 "theory"（理论）、"practice"（练习）或 "quiz"（测验）
- 每个模块至少包含 1 个 theory 课时
- 课时标题要具体、有意义，避免空泛
- content 字段需要写详细的内容描述（200-400字），这是课程的实质内容
- duration 根据内容量设置合理时长（如 "5分钟"、"10分钟"、"15分钟"）
- 模块之间有递进关系：基础 → 进阶 → 实战/拓展
- 确保课程内容覆盖学习者表现出的知识盲区`;

export async function POST(req: NextRequest) {
  try {
    const { messages, knowledgeNodes } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: '至少需要一些对话记录才能生成课程' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build context for AI
    let context = '## 学习者的对话记录\n\n';
    for (const msg of messages) {
      const role = msg.role === 'user' ? '学习者' : 'AI导师';
      context += `${role}: ${msg.content}\n\n`;
    }

    if (knowledgeNodes && knowledgeNodes.length > 0) {
      context += '## 已识别的知识节点\n\n';
      for (const node of knowledgeNodes) {
        context += `- ${node.title} (${node.category || '概念'}): ${node.content.slice(0, 200)} [已掌握: ${node.mastered}]\n`;
      }
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: COURSE_GENERATION_PROMPT },
        { role: 'user', content: context },
      ],
      thinking: { type: 'disabled' },
    });

    const aiContent = completion.choices?.[0]?.message?.content || '';

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: 'AI 生成课程失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON from AI response (may be wrapped in markdown code block)
    let jsonStr = aiContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const courseData = JSON.parse(jsonStr);

    // Validate structure
    if (!courseData.modules || !Array.isArray(courseData.modules)) {
      return new Response(
        JSON.stringify({ error: '课程结构无效' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ modules: courseData.modules }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Course generation error:', error);

    // Fallback: generate a basic course structure
    const fallbackModules = [
      {
        id: 'mod-1',
        sessionId: 'fallback',
        title: '基础知识回顾',
        order: 1,
        lessons: [
          { id: 'les-1-1', moduleId: 'mod-1', title: '核心概念入门', type: 'theory' as const, duration: '10分钟', status: 'available' as const, content: '回顾基础概念，建立知识框架。', order: 1 },
          { id: 'les-1-2', moduleId: 'mod-1', title: '基础概念练习', type: 'practice' as const, duration: '15分钟', status: 'locked' as const, content: '通过练习巩固基础概念。', order: 2 },
          { id: 'les-1-3', moduleId: 'mod-1', title: '基础测验', type: 'quiz' as const, duration: '10分钟', status: 'locked' as const, content: '检验基础知识的掌握程度。', order: 3 },
        ],
      },
      {
        id: 'mod-2',
        sessionId: 'fallback',
        title: '深入理解',
        order: 2,
        lessons: [
          { id: 'les-2-1', moduleId: 'mod-2', title: '进阶理论', type: 'theory' as const, duration: '15分钟', status: 'locked' as const, content: '深入学习进阶理论知识。', order: 1 },
          { id: 'les-2-2', moduleId: 'mod-2', title: '实战练习', type: 'practice' as const, duration: '20分钟', status: 'locked' as const, content: '通过实战练习加深理解。', order: 2 },
          { id: 'les-2-3', moduleId: 'mod-2', title: '综合测验', type: 'quiz' as const, duration: '15分钟', status: 'locked' as const, content: '综合检验学习成果。', order: 3 },
        ],
      },
      {
        id: 'mod-3',
        sessionId: 'fallback',
        title: '应用与实践',
        order: 3,
        lessons: [
          { id: 'les-3-1', moduleId: 'mod-3', title: '应用场景分析', type: 'theory' as const, duration: '10分钟', status: 'locked' as const, content: '分析知识在实际场景中的应用。', order: 1 },
          { id: 'les-3-2', moduleId: 'mod-3', title: '项目实战', type: 'practice' as const, duration: '25分钟', status: 'locked' as const, content: '通过项目实战综合运用所学知识。', order: 2 },
          { id: 'les-3-3', moduleId: 'mod-3', title: '最终测验', type: 'quiz' as const, duration: '15分钟', status: 'locked' as const, content: '最终综合测验，评估整体学习效果。', order: 3 },
        ],
      },
    ];

    return new Response(
      JSON.stringify({ modules: fallbackModules }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}