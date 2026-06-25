# MindGuide

> AI 对话式学习平台 — 通过苏格拉底式追问引导深度思考，自动追踪知识掌握状态，把每一次"提问"变成一次"学习"。

MindGuide 不是另一个聊天框。它把 AI 对话当作学习会话来设计：每一段对话都被结构化为知识节点、参考资料、笔记、课程、任务和闪卡，让学习者既能"问"，也能"复盘"。视觉上采用克制的学术风（衬线标题 + 中性灰阶 + 1px hairline 边框），动效上为每个组件定制独立的"个性"（command / discovery / ceremony / journey / reveal），拒绝复制粘贴的统一动画。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 语言 | TypeScript 5 (strict) |
| 样式 | Tailwind CSS 4 + shadcn/ui (New York) |
| 数据库 | Prisma ORM + SQLite |
| AI | z-ai-web-dev-sdk（仅服务端） |
| 编辑器 | Tiptap v3（17 extensions，含 KaTeX / code highlight / task list） |
| 动效 | Framer Motion（per-component spring 语言） |
| 状态 | Zustand（客户端） + TanStack Query（服务端） |

## 功能模块

| 模块 | 说明 |
|---|---|
| **AI 对话教学** | SSE 流式响应 · 苏格拉底式追问 · 三种学习模式（苏格拉底式 / 引导讲解 / 快速问答） |
| **知识图谱** | 自动提取知识点 · 追踪掌握状态（importance 1-5 + mastered） |
| **富文本笔记** | Tiptap 编辑器 · 支持公式 (KaTeX) · 代码高亮 · Markdown · 自动持久化 |
| **课程生成** | AI 自动生成结构化课程 · 章节进度追踪 · 持久化到 Prisma |
| **任务规划** | 学习计划分解 · 优先级 + 完成进度 · 持久化 |
| **学习卡片** | 闪卡 · 主动回忆 · SM-2 间隔重复算法 · 到期复习队列 |
| **成就系统** | 学习激励徽章 · 实时进度统计 |
| **学习统计** | 可视化学习轨迹 · 时间分布 · 连续学习 |
| **命令面板** | ⌘K 快速跳转 · 模糊搜索会话/功能/快捷键 |
| **统一搜索** | 跨会话内容检索 |
| **设置中心** | 外观 / 布局 / 配色 / 关于 — 四 tab · 共享 pill 滑动指示器 |

## 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 设置 DATABASE_URL

# 3. 初始化数据库
bun run db:push

# 4. 启动开发服务器
bun run dev
```

访问 `http://localhost:3000`

## 数据库模型

```
LearningSession   学习会话 (active / paused / completed / archived)
├─ LearningMessage   对话消息 (user / assistant / system)
├─ KnowledgeNode     知识节点 (importance 1-5 + mastered)
├─ Reference         参考资料
├─ Note              富文本笔记 (Tiptap HTML, 1:1)
├─ CourseModule      课程模块
│  └─ CourseLesson      课程课时 (theory / practice / quiz)
├─ Task              学习任务 (priority 1-5 + done)
└─ Card              闪卡 (SM-2: ease / interval / repetition / dueAt)
```

## API 路由

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/chat` | AI 对话 · 流式响应（SSE） |
| `POST` | `/api/course/generate` | AI 课程生成 |
| `GET` `POST` | `/api/sessions` | 会话列表 / 创建 |
| `GET` `PATCH` `DELETE` | `/api/sessions/[id]` | 单会话操作 |
| `GET` `POST` `DELETE` | `/api/sessions/[id]/messages` | 消息管理 |
| `GET` `POST` | `/api/sessions/[id]/knowledge` | 知识节点 |
| `PATCH` | `/api/knowledge/[id]` | 知识点掌握状态 toggle |
| `GET` `POST` | `/api/sessions/[id]/references` | 参考资料 |
| `GET` `PUT` | `/api/sessions/[id]/notes` | 笔记（持久化） |
| `GET` `POST` | `/api/sessions/[id]/course` | 课程模块 |
| `GET` `POST` | `/api/sessions/[id]/tasks` | 任务列表 |
| `PATCH` `DELETE` | `/api/tasks/[id]` | 单任务操作 |
| `GET` `POST` | `/api/sessions/[id]/cards` | 闪卡 |
| `POST` | `/api/sessions/[id]/cards/review` | 闪卡复习（SM-2 评分） |
| `PATCH` `DELETE` | `/api/cards/[id]` | 单闪卡操作 |
| `GET` | `/api/search` | 跨会话搜索 |
| `GET` | `/api/stats` | 学习统计 |
| `GET` | `/api/health` | 健康检查 |

## 键盘快捷键

| 快捷键 | 功能 |
|---|---|
| `⌘ K` / `Ctrl K` | 命令面板 |
| `⌘ 1-6` / `Ctrl 1-6` | 快速跳转功能（任务 / 卡片 / 课程 / 笔记 / 成就 / 统计） |
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Esc` | 关闭面板 / 模态 |

## 设计语言

- **色彩**：OKLCH 纯中性灰阶，无彩色品牌色 — 让内容本身成为视觉焦点
- **字体**：Geist (sans) + Lora (serif) + Geist Mono — 衬线标题营造学术感
- **边框**：1px hairline (`border-neutral-200`) — 平面、克制、无 3D 阴影
- **圆角**：卡片 16-20px · 按钮 8px — 学术方正而非装饰圆润
- **动效**：Framer Motion · per-component spring 语言（详见 [`docs/ANIMATION.md`](docs/ANIMATION.md)）
- **无 emoji / 装饰符号**：保持克制的书面语风格，所有状态用 lucide 图标 + 文字

## 项目文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 工程架构与代码组织
- [`docs/ANIMATION.md`](docs/ANIMATION.md) — 动画设计系统（项目核心工艺）
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — 版本与迭代记录
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — 贡献指南

## 项目结构

```
src/
├─ app/
│  ├─ api/                    # API 路由（17 endpoints）
│  ├─ globals.css             # 全局样式 + CSS 变量
│  ├─ layout.tsx              # 根布局 + 字体注入
│  └─ page.tsx                # 唯一用户路由（全应用入口）
├─ components/
│  ├─ learning/               # 业务组件（13 files）
│  │  ├─ main-content.tsx     # 主区域：Welcome + ChatView
│  │  ├─ sidebar.tsx          # 左侧栏：会话列表 + 搜索 + 更多功能
│  │  ├─ display-panel.tsx    # 三点菜单 + 设置入口
│  │  ├─ settings-view.tsx    # 设置模态（4 tabs）
│  │  ├─ create-new-panel.tsx # 更多功能面板（命令面板式）
│  │  ├─ feature-views.tsx    # 任务/卡片/课程/笔记/成就/统计 视图
│  │  ├─ course-panel.tsx     # 课程面板（侧抽屉）
│  │  ├─ card-review-mode.tsx # 闪卡复习模式
│  │  ├─ tiptap-editor.tsx    # 富文本笔记编辑器
│  │  ├─ command-palette.tsx  # ⌘K 命令面板
│  │  ├─ unified-search.tsx   # 跨会话搜索
│  │  ├─ mouse-follow-tooltip.tsx  # 鼠标跟随提示框
│  │  ├─ keyboard-shortcuts-overlay.tsx
│  │  ├─ knowledge-inline.tsx # 知识点内联展示
│  │  ├─ markdown-renderer.tsx
│  │  ├─ scroll-progress.tsx
│  │  └─ loading-utils.tsx
│  └─ ui/                     # shadcn/ui 基础组件
├─ store/
│  ├─ learning-store.ts       # Zustand: 会话/视图/成就
│  └─ preferences-store.ts    # Zustand: 主题/布局/配色偏好
├─ lib/
│  ├─ db.ts                   # Prisma client
│  ├─ sm2.ts                  # SM-2 间隔重复算法
│  ├─ emoji-sanitize.ts       # 历史 emoji 过滤
│  ├─ color-extract.ts        # 主题色提取
│  └─ utils.ts                # cn() 等工具
└─ hooks/
   └─ use-toast.ts
```

## License

MIT
