# MindGuide

AI 对话式学习平台。通过苏格拉底式追问引导深度思考，自动追踪知识掌握状态，把每一次提问转化为一次学习。

MindGuide 把 AI 对话当作学习会话来设计：每段对话被结构化为知识节点、参考资料、笔记、课程、任务和闪卡，让学习者既能提问，也能复盘。视觉上采用克制的学术风格——衬线标题、中性灰阶、1px hairline 边框；动效上为每个组件定制独立的运动语言，拒绝统一动画的复制粘贴。

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
| 图表 | Recharts + 手写 SVG |
| 流式动画 | FlowToken（token 到达视觉反馈） |

## 功能模块

| 模块 | 说明 |
|---|---|
| AI 对话教学 | SSE 流式响应。苏格拉底式追问。三种学习模式（引导 / 讲解 / 练习） |
| 多步推理引擎 | 深度推理模式（3 步：分析 / 推理 / 回答）与结构化推理模式（4 步：链式 / 批评 / 多路径 / 收敛）。每步独立调用模型，中间结果实时流式展示 |
| 推理过程可视化 | Reasoning 组件渲染模型真实 reasoning_content，支持折叠展开、时长计时、分步进度卡片 |
| RAG 检索增强 | BM25 风格哈希嵌入 + 树状检索 + 混合融合。引用编号标注，前端展示引用来源 |
| 知识图谱 | 自动提取知识点。追踪掌握状态（importance 1-5 + mastered）。内联与独立视图均可交互 |
| 富文本笔记 | Tiptap 编辑器。支持公式 (KaTeX)、代码高亮、Markdown。防抖 800ms 自动持久化 |
| 课程生成 | AI 自动生成结构化课程。章节进度追踪。课时状态（locked / available / active / completed） |
| 任务规划 | 学习计划分解。优先级 (1-5) + 完成进度。原生 HTML5 拖拽排序 |
| 学习卡片 | 闪卡 + 主动回忆。SM-2 间隔重复算法。到期复习队列。3D 翻卡动画 |
| 学习统计 | 成就系统（6 枚徽章）。30 天趋势折线图、14 天掌握进度堆叠面积图、知识结构雷达图 |
| 命令面板 | Cmd+K 快速跳转。模糊搜索会话与功能。layoutId 平滑滑动选中条 |
| 可拖拽布局 | react-resizable-panels。侧边栏宽度可调，autoSaveId 持久化 |
| 专注模式 | Cmd+E 进入。侧边栏平滑收缩，输入框居中放大，屏蔽视觉干扰 |
| 草稿持久化 | per-session localStorage。刷新不丢失输入内容 |
| 输入历史召回 | 上箭头召回上一条已发送消息，下箭头向前遍历。终端式导航 |
| 统一搜索 | 跨会话内容检索。文档 / 知识 / 对话 / 课程四类，220ms 防抖 |
| 文件导入 | PDF / Word / Markdown / PPTX / XLSX / HTML / 纯文本。结构感知分块 + 嵌入 + RAG |

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

## 质量检查

```bash
bun run lint        # ESLint
bun run typecheck   # tsc --noEmit
bun run build       # 生产构建（standalone output）
```

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | Prisma SQLite 数据库路径 | `file:../db/custom.db` |

z-ai-web-dev-sdk 通过 `z-ai configure` 命令管理的配置文件读取凭据，无需环境变量。详见 [z-ai-web-dev-sdk](https://github.com/z-ai-web-dev/z-ai-web-dev-sdk)。

## 数据库模型

```
LearningSession        学习会话 (active / paused / completed / archived)
+- LearningMessage     对话消息 (user / assistant / system)
+- KnowledgeNode       知识节点 (importance 1-5 + mastered)
+- Reference           参考资料
+- Note                富文本笔记 (Tiptap HTML, 1:1)
+- CourseModule        课程模块
|  +- CourseLesson     课程课时 (theory / practice / quiz)
+- Task                学习任务 (priority 1-5 + done)
+- LearningMaterial    学习材料 (文件上传 + 解析 + 分块)
   +- DocumentChunk    检索块 (含嵌入向量 + blockType + sectionPath)
+- Card                闪卡 (SM-2: ease / interval / repetition / dueAt)
```

## API 路由

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/chat` | AI 对话。SSE 流式响应。支持多步推理 + RAG |
| `POST` | `/api/course/generate` | AI 课程生成 |
| `GET` `POST` | `/api/sessions` | 会话列表 / 创建 |
| `GET` `PATCH` `DELETE` | `/api/sessions/[id]` | 单会话操作 |
| `GET` `POST` `DELETE` | `/api/sessions/[id]/messages` | 消息管理 |
| `GET` `POST` | `/api/sessions/[id]/knowledge` | 知识节点 |
| `PATCH` | `/api/knowledge/[id]` | 知识点掌握状态 / 重要度 |
| `GET` `POST` | `/api/sessions/[id]/references` | 参考资料 |
| `GET` `PUT` | `/api/sessions/[id]/notes` | 笔记持久化 |
| `GET` `POST` | `/api/sessions/[id]/course` | 课程模块 |
| `GET` `POST` | `/api/sessions/[id]/tasks` | 任务列表 |
| `PATCH` `DELETE` | `/api/tasks/[id]` | 单任务操作 |
| `GET` `POST` | `/api/sessions/[id]/cards` | 闪卡 |
| `POST` | `/api/sessions/[id]/cards/review` | 闪卡复习（SM-2 评分） |
| `PATCH` `DELETE` | `/api/cards/[id]` | 单闪卡操作 |
| `GET` `POST` | `/api/sessions/[id]/materials` | 学习材料上传 |
| `GET` `DELETE` | `/api/materials/[id]` | 单材料操作 |
| `GET` | `/api/materials/[id]/chunks` | 材料分块列表 |
| `GET` | `/api/materials/[id]/outline` | 材料大纲 |
| `POST` | `/api/materials/[id]/reparse` | 重新解析材料 |
| `GET` | `/api/sessions/[id]/retrieve` | RAG 检索 |
| `GET` | `/api/search` | 跨会话搜索 |
| `GET` | `/api/stats` | 学习统计（含 30 天趋势 / 知识分布 / 掌握进度） |
| `GET` | `/api/health` | 健康检查 |

## 键盘快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd K` / `Ctrl K` | 命令面板 |
| `Cmd E` / `Ctrl E` | 专注模式 |
| `Cmd B` / `Ctrl B` | 折叠 / 展开侧边栏 |
| `Cmd ,` / `Ctrl ,` | 打开设置 |
| `Cmd 1-6` / `Ctrl 1-6` | 快速跳转功能（任务 / 卡片 / 进度 / 图谱 / 笔记 / 文件） |
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行 |
| `Up` / `Down` | 输入历史召回（光标在边界时） |
| `Esc` | 关闭浮层 / 退出专注模式 |
| `?` | 显示快捷键帮助 |

## 核心算法

### RAG 检索 (src/lib/retrieval.ts)

混合检索策略，融合三路得分：

1. **BM25 风格哈希嵌入**（src/lib/text-embedding.ts）— FNV-1a 哈希将 token 映射到 1024 维向量，signed feature hashing + sublinear TF + L2 归一化。CJK 使用重叠 bigram，拉丁文过滤停用词。
2. **树状检索**（src/lib/semantic-index.ts）— 从文档结构树中提取大纲节点，按 rank 融合到候选集。
3. **角色增强**（src/lib/role-boost.ts + retrieval-boosts.ts）— 根据查询分类（概念 / 应用 / 排错）和知识节点角色（abstract / introduction / methods 等）施加 boost。

最终得分 = cosine(query, chunk) + sectionBoost + isTitleBoost + roleBoost + lexicalBoost

### SM-2 间隔重复 (src/lib/sm2.ts)

标准 SM-2 算法实现：
- ease factor 更新：`EF' = EF + (0.1 - (5-q)(0.08 + (5-q)*0.025))`
- ease 下限 1.3，repetition / interval 转移按规范
- quality 映射：忘了(0) / 困难(2) / 良好(4) / 简单(5)

### 多步推理引擎 (src/lib/multi-step-reasoning.ts)

将 thinkingMode 的 `deep` / `structured` 从 prompt overlay 升级为真正的多步 ReAct pipeline：

- **deep 模式**：3 步（分析问题 / 深度推理 / 组织回答）
- **structured 模式**：4 步（链式推理 / 自我批评 / 多路径探索 / 收敛输出）

每步独立调用模型，中间结果通过 SSE `stepStart` / `stepToken` / `step` 事件实时流式传输。单步失败自动重试一次。RAG 检索的段落带 `[1]` `[2]` 编号，模型可引用，前端渲染为可点击的引用标记。

### 文档分块 (src/lib/document-chunker.ts)

结构感知分块：先按文档结构（标题 / 段落 / 列表 / 代码块 / 表格）拆分，再按 token 预算（默认 512 tokens）合并。每个 chunk 记录 blockType / sectionPath / page / bbox 元数据。

## 设计语言

- **色彩**：OKLCH 纯中性灰阶，无彩色品牌色。用户可通过设置中心自定义强调色。
- **字体**：Geist (sans) + Lora (serif) + Geist Mono。衬线标题营造学术感。
- **边框**：1px hairline (`border-neutral-200`)。平面、克制、无 3D 阴影。
- **圆角**：卡片 16-20px，按钮 8px。
- **动效**：Framer Motion，per-component spring 语言。MotionConfig 支持全局禁用。
- **浮层阴影**：自定义柔和阴影 `0_4px_20px_-8px_rgba(0,0,0,0.12)`，避免 shadow-lg 的厚重感。

## 项目结构

```
src/
+- app/
|  +- api/                    # API 路由（25 endpoints）
|  +- globals.css             # 全局样式 + CSS 变量
|  +- layout.tsx              # 根布局 + 字体注入
|  +- page.tsx                # 唯一用户路由
+- components/
|  +- learning/               # 业务组件（20 files）
|  |  +- main-content.tsx     # 主区域：Welcome + ChatView + Reasoning
|  |  +- chat-composer.tsx    # 输入栏：浮动卡片 + 浮层菜单 + 发送
|  |  +- reasoning.tsx        # 推理面板：流式 + 分步 + Citation
|  |  +- sidebar.tsx          # 侧边栏：会话列表 + 搜索 + 折叠态
|  |  +- course-panel.tsx     # 课程面板：圆环进度 + 模块折叠
|  |  +- card-review-mode.tsx # 闪卡复习：3D 翻卡 + SM-2 评分
|  |  +- feature-views.tsx    # 功能视图：任务/卡片/进度/图谱/笔记/文件
|  |  +- tiptap-editor.tsx    # 富文本笔记编辑器
|  |  +- command-palette.tsx  # 命令面板
|  |  +- settings-view.tsx    # 设置中心（4 tabs）
|  |  +- ...
|  +- ui/                     # shadcn/ui 基础组件
+- hooks/
|  +- use-draft-input.ts      # 草稿持久化 + 输入历史召回
|  +- use-toast.ts            # Toast 通知
|  +- use-mobile.ts           # 移动端检测
+- lib/
|  +- multi-step-reasoning.ts # 多步推理引擎
|  +- retrieval.ts            # RAG 检索
|  +- text-embedding.ts       # 哈希嵌入
|  +- semantic-index.ts       # 语义索引（树状）
|  +- document-chunker.ts     # 文档分块
|  +- sm2.ts                  # SM-2 间隔重复
|  +- retrieval-boosts.ts     # 检索增强
|  +- role-boost.ts           # 角色增强
|  +- query-classifier.ts     # 查询分类
|  +- search-service.ts       # 跨会话搜索
|  +- file-parser/            # 文件解析器（PDF/DOCX/XLSX/PPTX/HTML/Text）
|  +- motion-tokens.ts        # 动效 token 抽象
|  +- db.ts                   # Prisma client
|  +- ...
+- store/
|  +- learning-store.ts       # Zustand: 会话/消息/推理/流式状态
|  +- preferences-store.ts    # Zustand: 主题/布局/配色偏好
+- types/
   +- react-syntax-highlighter.d.ts
```

## 安全须知

MindGuide 当前版本不包含用户认证。所有 API 路由公开可访问。NextAuth.js v4 已在依赖中声明但未接线。适合本地单用户学习场景，不建议直接暴露到公网。如需多用户部署，请先实现认证层。

## License

MIT
