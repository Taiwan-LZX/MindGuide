# MindGuide

AI 对话式学习平台 — 通过苏格拉底式追问引导深度思考，自动追踪知识掌握状态。

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **语言**: TypeScript 5 (strict)
- **样式**: Tailwind CSS 4 + shadcn/ui (New York)
- **数据库**: Prisma ORM + SQLite
- **AI**: z-ai-web-dev-sdk (server-side only)
- **编辑器**: Tiptap v3 (17 extensions)
- **动效**: Framer Motion

## 功能模块

| 模块 | 说明 |
|---|---|
| AI 对话教学 | SSE 流式响应 · 苏格拉底式追问 · 三种学习模式（苏格拉底式 / 引导讲解 / 快速问答） |
| 知识图谱 | 自动提取知识点 · 追踪掌握状态（importance 1-5 + mastered） |
| 富文本笔记 | Tiptap 编辑器 · 支持公式 (KaTeX) · 代码高亮 · Markdown |
| 课程生成 | AI 自动生成结构化课程 · 章节进度追踪 |
| 任务规划 | 学习计划分解 · 完成进度追踪 |
| 学习卡片 | 闪卡 · 主动回忆 · 间隔重复 |
| 成就系统 | 学习激励徽章 |
| 学习统计 | 可视化学习轨迹 · 时间分布 |

## 快速开始

```bash
# 安装依赖
bun install

# 初始化数据库
bun run db:push

# 启动开发服务器
bun run dev
```

访问 `http://localhost:3000`

## 数据库模型

```
LearningSession   学习会话 (active / paused / completed / archived)
LearningMessage   对话消息 (user / assistant / system)
KnowledgeNode     知识节点 (importance 1-5 + mastered)
Reference         参考资料
```

## API 路由

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/chat` | AI 对话 · 流式响应 |
| POST | `/api/course/generate` | AI 课程生成 |
| GET / POST | `/api/sessions` | 会话 CRUD |
| GET / PATCH / DELETE | `/api/sessions/[id]` | 单会话操作 |
| GET / DELETE / POST | `/api/sessions/[id]/messages` | 消息管理 |
| GET / POST | `/api/sessions/[id]/knowledge` | 知识节点 |
| GET / POST | `/api/sessions/[id]/references` | 参考资料 |
| PATCH | `/api/knowledge/[id]` | 知识点 toggle |

## 键盘快捷键

| 快捷键 | 功能 |
|---|---|
| `⌘ K` | 命令面板 |
| `⌘ 1-6` | 快速跳转功能 |
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Esc` | 关闭面板 |

## 设计语言

- **色彩**: OKLCH 纯中性灰阶，无彩色品牌色
- **字体**: Geist (sans) + Lora (serif) + Geist Mono
- **边框**: 1px hairline
- **圆角**: 卡片 16-20px · 按钮圆形
- **动效**: Framer Motion · `[0.25, 0.1, 0.25, 1]` 标准曲线

## License

MIT
