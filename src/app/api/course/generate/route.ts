import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

const COURSE_GENERATION_PROMPT = `你是一位资深的教育课程设计师。根据学习者的对话记录、已有知识点，以及学习者导入的学习资料，分析学习者的理解程度和知识盲区，然后生成一套结构化的学习课程。

## 任务

1. 分析学习者在对话中展现出的知识水平
2. 识别学习者的知识盲区和薄弱环节
3. 如果学习者导入的学习资料（见下方"导入的学习资料"小节）覆盖了相关知识点，课程应基于这些资料定制 —— 课时内容应引用资料中的具体概念、术语、章节结构
4. 生成 3-4 个学习模块，每个模块包含 4-6 个课时
5. 每个课时需包含理论、练习或测验内容
6. 根据难度合理设置预计时长

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
- 如果导入资料中有相关内容，content 应引用资料中的具体概念、定义、示例
- duration 根据内容量设置合理时长（如 "5分钟"、"10分钟"、"15分钟"）
- 模块之间有递进关系：基础 → 进阶 → 实战/拓展
- 确保课程内容覆盖学习者表现出的知识盲区`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages;
    const knowledgeNodes = body.knowledgeNodes;
    const sessionId: string | undefined = body.sessionId;

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

    // ─── Knowledge base: learner-imported materials ────────────────────────
    //
    // If the learner has uploaded study materials (PDFs, notes, code, etc.),
    // include their extracted text content as a "knowledge base" section in
    // the AI context. The course prompt (above) instructs the model to base
    // course content on these materials when relevant.
    //
    // We cap the total context at ~30k chars across all materials (after the
    // 50k per-file cap applied at upload time) to stay within model context
    // limits while still giving the model substantial reference material.
    if (sessionId) {
      const materials = await db.learningMaterial.findMany({
        where: { sessionId, status: 'ready', charCount: { gt: 0 } },
        select: { title: true, filename: true, content: true, charCount: true },
        orderBy: { createdAt: 'asc' },
      });
      if (materials.length > 0) {
        const KB_BUDGET = 30_000;
        let used = 0;
        const snippets: string[] = [];
        for (const m of materials) {
          if (used >= KB_BUDGET) break;
          const remaining = KB_BUDGET - used;
          const slice = m.content.slice(0, remaining);
          snippets.push(`### ${m.title || m.filename}\n\n${slice}`);
          used += slice.length;
        }
        context += `\n## 导入的学习资料\n\n学习者已导入以下学习资料，课程内容应基于这些资料定制（引用其中的具体概念、术语、章节）。\n\n${snippets.join('\n\n---\n\n')}\n`;
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

    let modules: any[] | null = null;

    if (aiContent) {
      // Parse JSON from AI response (may be wrapped in markdown code block)
      let jsonStr = aiContent.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      try {
        const courseData = JSON.parse(jsonStr);
        if (courseData.modules && Array.isArray(courseData.modules)) {
          modules = courseData.modules;
        }
      } catch {
        // fall through to fallback
      }
    }

    // Fallback if AI failed to produce valid structure
    if (!modules) {
      modules = [
        {
          id: 'mod-1',
          sessionId: sessionId || 'fallback',
          title: '基础知识回顾',
          order: 1,
          lessons: [
            { id: 'les-1-1', moduleId: 'mod-1', title: '核心概念入门', type: 'theory', duration: '10分钟', status: 'available', content: '回顾基础概念，建立知识框架。', order: 1 },
            { id: 'les-1-2', moduleId: 'mod-1', title: '基础概念练习', type: 'practice', duration: '15分钟', status: 'locked', content: '通过练习巩固基础概念。', order: 2 },
            { id: 'les-1-3', moduleId: 'mod-1', title: '基础测验', type: 'quiz', duration: '10分钟', status: 'locked', content: '检验基础知识的掌握程度。', order: 3 },
          ],
        },
        {
          id: 'mod-2',
          sessionId: sessionId || 'fallback',
          title: '深入理解',
          order: 2,
          lessons: [
            { id: 'les-2-1', moduleId: 'mod-2', title: '进阶理论', type: 'theory', duration: '15分钟', status: 'locked', content: '深入学习进阶理论知识。', order: 1 },
            { id: 'les-2-2', moduleId: 'mod-2', title: '实战练习', type: 'practice', duration: '20分钟', status: 'locked', content: '通过实战练习加深理解。', order: 2 },
            { id: 'les-2-3', moduleId: 'mod-2', title: '综合测验', type: 'quiz', duration: '15分钟', status: 'locked', content: '综合检验学习成果。', order: 3 },
          ],
        },
        {
          id: 'mod-3',
          sessionId: sessionId || 'fallback',
          title: '应用与实践',
          order: 3,
          lessons: [
            { id: 'les-3-1', moduleId: 'mod-3', title: '应用场景分析', type: 'theory', duration: '10分钟', status: 'locked', content: '分析知识在实际场景中的应用。', order: 1 },
            { id: 'les-3-2', moduleId: 'mod-3', title: '项目实战', type: 'practice', duration: '25分钟', status: 'locked', content: '通过项目实战综合运用所学知识。', order: 2 },
            { id: 'les-3-3', moduleId: 'mod-3', title: '最终测验', type: 'quiz', duration: '15分钟', status: 'locked', content: '最终综合测验，评估整体学习效果。', order: 3 },
          ],
        },
      ];
    }

    // Persist to database if sessionId provided
    let persistedModules: any[] | null = null;
    if (sessionId) {
      try {
        // Replace existing course atomically
        await db.$transaction([
          db.courseLesson.deleteMany({ where: { module: { sessionId } } }),
          db.courseModule.deleteMany({ where: { sessionId } }),
        ]);

        for (let mi = 0; mi < modules.length; mi++) {
          const m = modules[mi];
          const createdModule = await db.courseModule.create({
            data: {
              sessionId,
              title: String(m.title || `模块 ${mi + 1}`).slice(0, 200),
              order: Number.isFinite(m.order) ? m.order : mi,
            },
          });
          const lessons = Array.isArray(m.lessons) ? m.lessons : [];
          for (let li = 0; li < lessons.length; li++) {
            const l = lessons[li];
            await db.courseLesson.create({
              data: {
                moduleId: createdModule.id,
                title: String(l.title || `课时 ${li + 1}`).slice(0, 200),
                type: ['theory', 'practice', 'quiz'].includes(l.type) ? l.type : 'theory',
                duration: String(l.duration || '10分钟').slice(0, 20),
                status: ['locked', 'available', 'active', 'completed'].includes(l.status) ? l.status : 'locked',
                content: String(l.content || '').slice(0, 5000),
                order: Number.isFinite(l.order) ? l.order : li,
              },
            });
          }
        }

        // Fetch back the persisted modules with proper DB IDs
        persistedModules = await db.courseModule.findMany({
          where: { sessionId },
          include: { lessons: { orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        });
      } catch (dbError) {
        console.error('Persist course error:', dbError);
        // Continue to return unpersisted modules if DB write fails
      }
    }

    // Return persisted modules if available, otherwise the raw generated ones
    const responseModules = persistedModules || modules;

    return new Response(
      JSON.stringify({ modules: responseModules }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Course generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate course' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
