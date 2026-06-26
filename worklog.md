---
Task ID: deploy-mindguide-1
Agent: main (Z.ai Code)
Task: Deploy the MindGuide project (https://github.com/Taiwan-LZX/MindGuide.git) into the existing Next.js sandbox at /home/z/my-project

Work Log:
- Cloned https://github.com/Taiwan-LZX/MindGuide.git to /tmp/MindGuide
- Reviewed README.md, package.json, prisma/schema.prisma, next.config.ts, layout.tsx, page.tsx to understand the project (Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite + z-ai-web-dev-sdk + Tiptap v3 + Framer Motion)
- Stopped the previously-running Next.js dev server (killed `next dev` / `bun run dev`) and confirmed port 3000 was free
- Copied MindGuide source files into /home/z/my-project:
  - src/* (app/, components/learning/, components/ui/, hooks/, lib/, store/, types/)
  - prisma/schema.prisma
  - next.config.ts, tsconfig.json, tailwind.config.ts, components.json, postcss.config.mjs, eslint.config.mjs
  - public/logo.svg, public/robots.txt
  - .env.example
- Replaced /home/z/my-project/package.json with MindGuide's package.json (adds @tiptap/* 17 extensions, katex, lowlight, highlight.js, mammoth, mupdf, unpdf, xlsx, jszip, rehype-katex, remark-math)
- Ran `bun install` → 123 new packages installed successfully (Tiptap, katex, mammoth, mupdf, unpdf, xlsx, etc.)
- Created /home/z/my-project/.env with DATABASE_URL="file:../db/custom.db"
- Ran `bun run db:push` → Prisma schema synced to SQLite (LearningSession, LearningMessage, KnowledgeNode, Reference, Note, CourseModule, CourseLesson, Task, LearningMaterial, DocumentChunk, Card)
- Wrote /home/z/my-project/start-dev.sh (exec wrapper) and started the dev server fully detached via `( setsid /home/z/my-project/start-dev.sh </dev/null >/dev/null 2>&1 & ) &` so it survives shell exit
- Verified dev server: GET / → 200 (43KB HTML), GET /api/health → 200 {"status":"ok","db":"writable"}, GET /api/sessions → 200 [], POST /api/sessions → 200 (created), GET /api/stats → 200 (achievements + weeklyActivity + totals)
- Used Agent Browser to open http://127.0.0.1:3000/ — title "MindGuide - AI 对话式学习", no console errors, no page errors, HMR connected
- Took full-page screenshot and analyzed with VLM (z-ai vision): page renders properly with sidebar (我的学习 / 分享的 tabs, search bar, session list) + main content area (topic input + GLM-4.6 model selector + send button). No blank screen, no error boundary.
- Tested core interaction: typed "什么是量子纠缠？" into the input, clicked 发送消息. The app auto-created a new LearningSession, fetched all 8 related endpoints (messages/tasks/course/notes/references/knowledge/cards/materials), and POST /api/chat → 200 returned a Socratic follow-up ("你对量子纠缠有什么了解呢？或者你是在什么情况下接触到这个概念的？") — exactly the teaching style described in the README
- Tested mobile responsiveness at 375x812: VLM confirms layout adapts, no overlap, no horizontal scroll
- Tested ⌘K command palette: VLM confirms the overlay renders with search input, categorized results (会话 / 创建新学习主题 / 导航 / 功能), and footer "MindGuide · 命令面板"
- Ran `bun run lint` → 0 errors / 0 warnings

Stage Summary:
- MindGuide v1.1.0 successfully deployed at http://127.0.0.1:3000/ (only user route is `/`, as required)
- Dev server running detached on port 3000, fully stable across multiple bash sessions
- All 17 API endpoints compile and respond 200
- SQLite database initialized with the full Prisma schema (11 models)
- z-ai-web-dev-sdk AI chat endpoint works end-to-end (Socratic dialogue confirmed)
- Tiptap v3, KaTeX, Framer Motion, shadcn/ui New York all rendering correctly
- Mobile + desktop responsive verified
- Command palette (⌘K) verified
- Lint passes with 0 errors / 0 warnings
- Produced artifacts: /home/z/my-project/start-dev.sh (dev launcher), /home/z/my-project/.env (DATABASE_URL)
- Note: the project uses an app-shell layout (`h-dvh w-screen overflow-hidden` with sidebar + main area), not a traditional document layout with a sticky footer — this is by design per the MindGuide spec.

---
Task ID: research-modules-2b
Agent: Explore (modules interaction research)
Task: 调研 MindGuide 其他功能模块的操作逻辑与一致性

Work Log:
- 阅读 worklog.md 了解部署背景（Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite + Tiptap v3 + Framer Motion）
- 通读 14 个目标文件，整理每个模块的入口、关闭方式、状态、联动、不一致点：
  · course-panel.tsx (566 行) — 右侧抽屉，relative + shrink-0，无 backdrop
  · feature-views.tsx (1883 行) — 含 TaskPlannerView / LearningCardsView / ProgressView(merged 成就+统计) / KnowledgeGraphView / NotesView / MaterialsView
  · card-review-mode.tsx (327 行) — SM-2 复习模式，全屏替换卡片列表
  · tiptap-editor.tsx (576 行) — 防抖 800ms 自动保存，store + DB
  · knowledge-inline.tsx (98 行) — 对话流内联展示知识点
  · command-palette.tsx (460 行) — ⌘K 触发，ESC + 外部点击关闭
  · unified-search.tsx (550 行) — 220ms 防抖，下拉面板，外部点击关闭
  · settings-view.tsx (1182 行) — 4 tabs + pill 滑动指示器，ESC + 外部点击关闭
  · display-panel.tsx (371 行) — 三个点快捷菜单，外部点击关闭
  · sidebar.tsx (721 行) — 会话列表 + 折叠态，无 ESC/外部点击关闭
  · scroll-progress.tsx (35 行) — 1px 进度条
  · mouse-follow-tooltip.tsx (282 行) — Portal 到 body
  · keyboard-shortcuts-overlay.tsx (178 行) — ? 触发
- 跟踪 store 中所有持久化点：DB (Prisma SQLite) / localStorage (preferences + unlocked-achievements) / in-memory zustand
- 重点验证 3 类"自动收回 / 失焦关闭 / ESC 关闭"行为的实现差异
- 发现 8 处明确的不一致问题，详见 Stage Summary

Stage Summary:

────────────────────────────────────────────────────────────────────────
模块交互模式汇总表
────────────────────────────────────────────────────────────────────────

| 模块 | 入口 | 关闭方式 | 状态持久化 | 加载/空状态 | 联动 |
|------|------|----------|------------|-------------|------|
| 课程面板 | 顶栏 BookOpen 按钮 / 命令面板「打开课程面板」 / 折叠侧栏图标 | 仅 X 按钮 / 切换 BookOpen 按钮；**无 ESC / 无外部点击** | DB (CourseModule/Lesson) + store.coursePanelOpen | LoadingOverlay (isGeneratingCourse) + 空提示 | selectSession 不关闭；生成课程后自动 open=true |
| 任务规划 | 更多功能面板 / 命令面板 / ⌘1（仅 popover 打开时生效） | FeatureHeader 返回箭头 setActiveFeatureView(null) | DB (Task) 乐观更新 + 回滚 | 骨架屏 3 条 + EmptyState | toggleTask 不刷新 stats；selectSession 重置 tasks=[] |
| 学习卡片 | 同上 / ⌘2 | 同上 | DB (Card) | 骨架屏 + EmptyState | toggleCardMastered 不联动 stats；selectSession 重置 cards=[] |
| 卡片复习模式 | CardsView 顶部「开始复习」按钮 | X 按钮 / ESC / 完成后「返回卡片列表」 | DB (Card.ease/interval/dueAt) + store.isReviewing | 加载旋转 + 空队列 + 完成汇总 | forgot(q=0) → 重新入队尾；exitReview 清空所有 review 状态 |
| 学习进度（成就+统计合并） | 同上 / ⌘3 | 同上 | DB (stats API) + localStorage (unlocked-achievements) | achievements.length===0 时显示"加载中" | fetchStats 检测新解锁 → toast 通知；updateLessonStatus 后调用 fetchStats |
| 知识图谱 | 同上 / ⌘4 | 同上 | DB (KnowledgeNode) | EmptyState | 点击 mastered 复选框 toggleKnowledgeMastered；对话流内 KnowledgeInline 镜像同一 store |
| 学习笔记 | 同上 / ⌘5 | 同上 | DB (Note) 防抖 800ms | 无（直接显示编辑器） | notesContent 同步编辑器；selectSession 重置 notesContent='' |
| Tiptap 编辑器 | NotesView 内嵌 | — | DB PUT /api/sessions/:id/notes | SaveStatusIndicator (idle/saving/saved/error) | ESC 关闭 LinkDialog/MathDialog；session 切换 setContent |
| 命令面板 | ⌘K / Ctrl+K（全局） | ESC / 外部点击 / 选中后自动关闭 | 仅本地 query 状态 | 空结果提示 | 触发后 close()；含静态命令 + 动态会话搜索 |
| 统一搜索 | 侧边栏顶部输入框 | ESC / 外部点击（50ms 延迟挂载）/ 清除按钮 | 无持久化 | 旋转 spinner + 空结果提示 | onResultClick 切换会话；sessionId 限定范围 |
| 设置中心（详细） | 快捷菜单「设置」/ 命令面板「显示设置」 | ESC / X / 外部点击 | localStorage (motion + accent) + next-themes | 静态 hint 预设 | 切换 tab 方向感知；hover 切换右侧 preview hint |
| 快捷菜单（三个点） | 顶栏 MoreVertical 按钮 | ESC / X / 外部点击 backdrop | 无 | 静态 | 切到设置时关闭自身 |
| 更多功能面板 | 侧栏底部 / 折叠侧栏图标 / 命令面板 | ESC / X / 外部点击（50ms 延迟） | 无 | 静态 | ⌘1-6 仅在面板打开时生效；选中后关闭 |
| 侧边栏 | 显示模式 / store.sidebarOpen | 仅 setSidebarOpen；**无 ESC / 无外部点击** | store + displayMode | 进行中/已完成分组 + EmptyState | displayMode='full' 强制折叠；selectSession 切换会话 |
| 滚动进度 | 自动渲染于 FeatureView 顶部 | — | 无 | — | useScroll container 模式 |
| 鼠标跟随提示 | hover 触发 | 鼠标离开 | 无 | — | 受 usePreferences.motionEnabled 控制 |
| 键盘快捷键覆盖层 | ? 键（非输入框时） | ESC / 外部点击 / X | 无 | 静态 | 列出的部分快捷键未注册（见不一致点） |

────────────────────────────────────────────────────────────────────────
发现的不一致问题清单（按严重程度排序）
────────────────────────────────────────────────────────────────────────

[严重] 1. 键盘快捷键覆盖层列出的快捷键与实际实现不同步
  - keyboard-shortcuts-overlay.tsx:40-46 列出 ⌘3=成就系统 / ⌘4=学习统计 / ⌘5=知识图谱 / ⌘6=学习笔记
  - 实际 create-new-panel.tsx:41-46 中只有 6 个功能，shortcut '3' = 学习进度（已合并），'6' = 文件导入
  - 文件导入(⌘6) 在 overlay 中完全未提及；成就/统计已被合并为「学习进度」但 overlay 未更新
  - 而且 ⌘1-6 的全局处理器仅在 createNewPanelOpen=true 时才挂载（create-new-panel.tsx:280-299），用户必须先打开「更多功能」面板才能用 ⌘1-6，overlay 却暗示这些是随时可用的

[严重] 2. ⌘B（折叠侧边栏）和 ⌘,（打开显示设置）从未注册
  - keyboard-shortcuts-overlay.tsx:33-34 列出这两个快捷键
  - 全代码库 grep `key === 'b'` / `key === 'B'` / `key === ','` 零匹配
  - 用户按这两个组合不会触发任何行为

[严重] 3. 课程面板的关闭契约与其他浮层完全不一致
  - course-panel.tsx 没有 backdrop、没有 mousedown 外部点击监听、没有 ESC 监听
  - 对比：command-palette / settings-view / settings-panel(display-panel) / more-features(create-new-panel) / unified-search 全部都有「外部点击 + ESC」关闭
  - 课程面板只能通过点击 X 按钮（或再次点击顶栏 BookOpen 按钮）关闭
  - 用户在面板外任意位置点击都不会关闭，这与平台其他浮层行为不一致

[中等] 4. 切换会话时各模块的重置策略不一致
  - learning-store.ts:503-520 selectSession 重置 activeFeatureView=null、清空 messages/tasks/cards/notes/materials
  - 但 coursePanelOpen 未被重置 → 上一会话打开的课程面板在新会话里仍然展开（仅内容会被 fetchCourse 替换或显示「尚未生成」提示）
  - createNewPanelOpen / settingsPanelOpen / settingsViewOpen 也未被重置
  - 用户切到新会话后，原来打开的浮层仍然停留在屏幕上

[中等] 5. 课程面板与功能视图（FeatureView）的层叠关系未定义
  - page.tsx:153 CoursePanel 与 FeatureView 是同级 sibling（同在 main area 内）
  - setActiveFeatureView 不关闭 coursePanelOpen（learning-store.ts:1354 只关 createNewPanelOpen）
  - 用户可以同时打开「课程面板 + 笔记编辑器」或「课程面板 + 任务规划」，两者抢宽度（380px + 居中 max-w-600px 内容）
  - 反观 MoreFeaturesPanel 一旦选中功能就会自动关闭，行为不一致

[中等] 6. AchievementsView 与 StatsView 实际已合并，但任务描述仍把它们当作两个模块
  - feature-views.tsx:742-1035 只有一个 ProgressView（注释明确说"merged because both consumed the same /api/stats feed"）
  - 没有独立的 AchievementsView / StatsView 导出，FEATURE_SECTION_NUMBER 也是 progress='03' 单条
  - 这不是 bug，但若产品调研基于旧文档/旧结构，需要同步认知

[中等] 7. 知识图谱视图是只读的，但内联版本（KnowledgeInline）可切换 mastered
  - feature-views.tsx:1135 KnowledgeGraphView 只渲染节点 + 重要度，无任何点击交互
  - knowledge-inline.tsx:74 KnowledgeInline 的复选框可 toggleKnowledgeMastered
  - 同一个数据源，主视图只读、内联视图可写，对用户而言是反直觉的

[中等] 8. ProgressView 没有使用 recharts，但 package.json 仍安装了 recharts
  - ProgressView 所有图表（圆环 ReviewRing、横条 ReviewBar、柱状 weeklyActivity、成就进度条）都是手写 SVG/div + framer-motion
  - src/components/ui/chart.tsx 引用了 recharts 但 feature-views 没用它
  - 不是 bug，但是 dead dependency；若以后做更复杂图表（折线/堆叠面积）需要决定是否启用

[次要] 9. 卡片复习模式的 ESC 与命令面板的 ESC 行为不同
  - card-review-mode.tsx:66 ESC 退出复习模式（清空所有 review 状态）
  - command-palette.tsx:269 ESC 关闭命令面板
  - 两者都监听 window keydown；若同时存在（理论上不会，但代码层面没互斥），ESC 会同时触发两个 handler
  - 复习模式中按 ESC 没有确认对话，直接丢弃已评级的卡片状态（虽然 PATCH 已落库）

[次要] 10. 统一搜索与命令面板的 ⌘K 提示冲突
  - unified-search.tsx:340 在输入框右侧显示 ⌘K kbd 提示，但点击它无反应（pointer-events-none）
  - 用户可能误以为 ⌘K 会聚焦搜索框，实际 ⌘K 打开的是命令面板（另一个组件）
  - 命令面板与统一搜索是两套独立的搜索实现（一个搜功能/会话，一个搜文档/知识/对话/主题），用户认知负担较高

[次要] 11. 侧边栏创建主题表单与笔记编辑器的失焦保存策略不同
  - sidebar.tsx:361 创建主题输入框 ESC=取消、Enter=提交，无失焦保存
  - sidebar.tsx:650 编辑标题输入框同样 ESC=取消、Enter=提交
  - tiptap-editor.tsx 的笔记内容是防抖 800ms 自动保存，无手动保存按钮
  - 任务（feature-views.tsx:381）输入框 Enter=提交，无 ESC 取消
  - 三种输入交互契约不统一

[次要] 12. 折叠态侧边栏的「搜索」按钮无 onClick
  - sidebar.tsx:177-194 折叠态搜索按钮没有 onClick handler，点击无任何反应
  - 同行其他按钮（课程、更多功能、账号）都有 onClick 或 tooltip 但搜索按钮是死按钮
  - 推测是占位待实现

[次要] 13. MouseFollowTooltip 的 motion 门控只覆盖 opacity，未覆盖 x/y spring
  - mouse-follow-tooltip.tsx:246 motionEnabled ? 0.15 : 0 仅作用于 opacity
  - 当 follow=true 时，x/y 仍然是 spring(600, 36, 0.6)，关闭动态效果后跟随仍有"液体感"
  - 与 settings-view.tsx 的 MotionConfig reducedMotion='always' 不完全一致（MotionConfig 主要 strip transform/layout，但 spring 本身仍会运行）

[次要] 14. 课程课时状态切换缺少「撤销」路径
  - course-panel.tsx:217 handleLessonClick: available→active→completed，单向递进
  - 已 completed 的课时点击无反应（无 case 分支）
  - 用户误点标记完成后无法回退到 active/available
  - 知识节点（knowledge-inline.tsx）的 mastered 可以来回切换，行为不一致

────────────────────────────────────────────────────────────────────────
关键观察：自动收回 / 失焦关闭 / ESC 关闭的契约矩阵
────────────────────────────────────────────────────────────────────────

| 模块 | ESC 关闭 | 外部点击关闭 | 失焦/防抖保存 | 自动收回条件 |
|------|----------|--------------|----------------|----------------|
| 命令面板 | ✅ | ✅ backdrop onClick | — | 选中后自动 close() |
| 设置中心 | ✅ | ✅ backdrop onClick | — | — |
| 快捷菜单 | ✅ (page.tsx:77) | ✅ backdrop onClick | — | — |
| 更多功能面板 | ✅ | ✅ panelRef.contains | — | 选中功能后自动关闭 |
| 统一搜索下拉 | ✅ | ✅ container.contains | 220ms 防抖搜索 | — |
| 课程面板 | ❌ | ❌ | — | — |
| 卡片复习模式 | ✅ (exitReview) | ❌ | — | 完成后自动显示汇总 |
| 键盘快捷键覆盖层 | ✅ | ✅ backdrop onClick | — | — |
| Tiptap LinkDialog/MathDialog | ✅ | ✅ mousedown outside | — | — |
| 笔记内容 | — | — | 800ms 防抖 PUT | — |
| 侧边栏 | ❌ | ❌ | — | — |
| 会话标题编辑 | ✅ 取消 | ❌ | Enter 提交 / ESC 取消 | — |

→ 课程面板和侧边栏是"持久浮层"（无 ESC / 无外部点击），其他浮层都是"模态/半模态"。这个二分法在产品文档里需要明确，否则用户会下意识按 ESC 期望关闭课程面板却失败。

────────────────────────────────────────────────────────────────────────
调研结论
────────────────────────────────────────────────────────────────────────

MindGuide 的 14 个非输入框模块整体设计感很强（学术风格、framer-motion 动效一致、motion-tokens 统一），但在"关闭契约"和"快捷键承诺"两个维度存在明显不一致：

1. 关闭契约：8 个浮层中只有课程面板没有 ESC / 外部点击关闭；侧边栏作为常驻面板合理地豁免，但课程面板是"打开-查看-关闭"型，应与其他浮层对齐。

2. 快捷键承诺：keyboard-shortcuts-overlay 是唯一面向用户的快捷键文档，但其中 ⌘B / ⌘, 完全未实现，⌘3-6 的标签与实际功能错位，⌘1-6 还受限于"必须先打开更多功能面板"。这会直接损害用户对快捷键系统的信任。

3. 状态重置：selectSession 重置了大多数 per-session 状态，但漏掉了 coursePanelOpen / createNewPanelOpen / settingsPanelOpen / settingsViewOpen，导致切会话后浮层残留。

4. 模块联动：知识图谱主视图只读、内联视图可写的反差，以及课程面板与功能视图可同时打开抢占宽度，都是后续一致性改进的切入点。

下一步建议（不在本调研范围，但供产品参考）：
- 统一所有"浮层"的关闭契约（ESC + 外部点击 + X 至少二选一，最好三者都有）
- 修复 keyboard-shortcuts-overlay 使其与实际注册的快捷键同步
- 在 selectSession 中重置所有浮层 open 状态
- 决定课程面板与功能视图的互斥/共存策略
- 决定是否启用 recharts 或移除依赖

---
Task ID: research-input-2a
Agent: Explore (input interaction research)
Task: 调研 MindGuide 输入组件交互逻辑问题根因

Work Log:
- 阅读 /home/z/my-project/worklog.md 了解部署背景（Next.js 16 + TS + Tailwind 4 + shadcn/ui + Tiptap v3 + Framer Motion + z-ai-web-dev-sdk，已部署运行在 http://127.0.0.1:3000/）
- 通读核心输入组件 src/components/learning/chat-composer.tsx（1615 行），定位 auto-resize / maxHeight / popover 渲染逻辑
- 通读 src/components/learning/main-content.tsx（929 行），定位 ChatView 与 WelcomeView 中 ChatComposer 的不同布局上下文（welcome 居中 vs chat 浮动底部）
- 通读 src/components/learning/create-new-panel.tsx（373 行），定位 MoreFeaturesPanel 的 click-outside 自动关闭逻辑与 fixed 定位
- 通读 src/components/learning/appearance-popover.tsx（233 行）作为对照——该组件用 createPortal + getBoundingClientRect 正确锚定到 trigger，是"正确做法"的参考实现
- 通读 src/components/learning/display-panel.tsx（371 行）确认三点菜单 SettingsPanel 使用 fixed right-2 top-2 + 透明 backdrop 拦截点击
- grep src/store/learning-store.ts 中 displayMode / sidebarOpen / createNewPanelOpen / activeFeatureView 等状态字段及 setter
- 通读 src/app/globals.css（260 行）确认全局 CSS 没有任何 textarea max-height / rows 限制（约束全部在组件层）
- 通读 src/app/page.tsx 确认应用外壳布局：flex h-dvh w-screen overflow-hidden，MoreFeaturesPanel / SettingsPanel / CoursePanel 等浮层都挂在主内容区内
- grep displayMode/sidebarOpen 的所有用法，确认 displayMode = 'side' | 'half' | 'full'，仅控制侧栏可见性，不影响输入框位置

Stage Summary:

【问题1根因：点击输入栏内按钮时"脱离操作框"】
所有四个浮层（AttachMenu / ModeMenu / ThinkingMenu / ModelCardMenu）都渲染在 chat-composer.tsx 顶层的 `<div className="relative flex flex-col">` wrapper 内（chat-composer.tsx 第 575 行），但使用 `position: absolute` + `bottom-full left-0` / `bottom-full right-0` / `left-full top-0`（见 menuPos 函数 chat-composer.tsx 第 954-966 行 + ModeMenu 第 1253 行），锚定到 **composer wrapper 的边界**，而不是各自 trigger 按钮的边界。

具体后果：
- AttachMenu（chat-composer.tsx 第 968-1016 行）使用 `absolute bottom-full left-0 mb-2` → 出现在 composer 卡片"正上方左对齐"。trigger 按钮位于卡片左下角，菜单位于卡片左上角之上，两者垂直间距 ≈ 整个 composer 高度（textarea + toolbar + hint），视觉上菜单"飘"在卡片顶部之上而非紧贴 + 按钮。
- ThinkingMenu / ModelCardMenu（chat-composer.tsx 第 1310-1364 / 1388-1472 行）使用 `absolute bottom-full right-0 mb-2` → 同理，菜单出现在 composer 卡片"正上方右对齐"，与右下角 trigger 之间垂直间距 ≈ 整个 composer 高度。
- ModeMenu（chat-composer.tsx 第 1232-1294 行）使用 `absolute left-full top-0 ml-2` → 菜单出现在 composer wrapper 的"右侧顶端"，而 trigger 位于 wrapper 的左下角，水平 + 垂直方向都严重错位，菜单实际位置完全脱离 trigger。

usePopover hook（chat-composer.tsx 第 170-215 行）只把 trigger 的 ref 用于点击外部检测和 up/down 翻转测量，**完全没有用 getBoundingClientRect 把菜单定位到 trigger 位置**。对比 appearance-popover.tsx 第 75-87 行 + 第 126-133 行的 `createPortal + position: fixed + btnRef.getBoundingClientRect()`，可见 chat-composer 的浮层缺少正确的 trigger 锚定。

此外，composer 卡片本身使用 `overflow-hidden`（chat-composer.tsx 第 610 行），把浮层渲染到 wrapper 层（而非 card 层）是为了避免被裁剪，但这也意味着浮层脱离了 trigger 的视觉上下文。

【问题2根因：上方输入区域最多只能输入 3 行】
chat-composer.tsx 第 322-336 行的 auto-resize effect 把 textarea 高度硬限到 `expanded ? 320 : 140`：

```js
const [expanded, setExpanded] = useState(false);
useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = 'auto';
  const maxH = expanded ? 320 : 140;
  el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  ...
}, [value, expanded]);
```

第 642 行的 inline style `style={{ maxHeight: expanded ? 320 : 140 }}` 双重锁死同样的上限。
- compact 模式（默认）：maxHeight = 140px；按 textarea 的 `text-[13px] leading-[1.55]` + `py-0.5`（2px 上下内边距）算，140px 大约容纳 (140-4)/(13*1.55) ≈ 6.7 行可见文本。用户反馈"3 行"可能因为超出后内部滚动、视觉上仅看到 3 行上下文。
- expanded 模式：maxHeight = 320px，约 16 行，但触发条件苛刻（见问题3）。

注：textarea 上没有 `rows={3}` 之类的硬限制（第 641 行 `rows={1}` 只是初始行数），真正的限制来源是 effect 中的 `maxH` 常量。

【问题3根因：输入框没有向上扩展的能力】
"向上扩展"在这里有两层含义，都失效：

(a) 高度自动扩展被 cap：textarea 在 compact 模式被钉死在 140px（chat-composer.tsx 第 327 行），无法随内容继续向上生长。超过 140px 后 textarea 内部出现滚动条，外部 composer wrapper 不再增高。

(b) "展开"按钮的触发条件过于严苛：
- chat-composer.tsx 第 648-662 行：`{charCount > 280 && (...)}` —— 必须输入超过 280 个字符才会出现"展开/收起"切换按钮。短消息场景下用户根本看不到展开入口。
- chat-composer.tsx 第 414-415 行：sceneChip 中的 `'expand'` 也是 `value.length > 280 && !expanded` 才触发，且自动 6 秒后消失（第 426-429 行 setTimeout）。
- 用户在 280 字符以下时完全没有手动展开的入口；超过 280 字符后即使点了"展开"，maxHeight 也只升到 320px，仍可能不够。

(c) 主对话视图布局上 composer 是 `pointer-events-none absolute inset-x-0 bottom-0 z-40`（main-content.tsx 第 577 行），按理 `bottom-0` + 内容自适应高度会让 wrapper 向上生长。但消息容器有 `pb-44`（main-content.tsx 第 382 行，176px 底部内边距）专门给 composer 让位，超过这个高度会直接覆盖最后几条消息（虽然上方有渐变蒙层 `bg-gradient-to-t from-white via-white/95` 缓解，但视觉上仍是覆盖）。WelcomeView（main-content.tsx 第 792-808 行）用 `flex flex-1 flex-col items-center justify-center pb-24` 居中 composer，textarea 增高时 wrapper 向上下两侧同时扩展，但仍受 140/320 cap 限制。

【问题4根因：底部"生成模块"自动收回】
"生成模块" = MoreFeaturesPanel（create-new-panel.tsx 第 255-373 行），由侧栏底部"更多功能"按钮触发（sidebar.tsx 第 560-578 行，带 `data-more-features-trigger` 标记）。

自动收回的根因是过于激进的 click-outside 检测（create-new-panel.tsx 第 259-276 行）：

```js
useEffect(() => {
  if (!createNewPanelOpen) return;
  const handler = (e: MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      const trigger = e.target as HTMLElement;
      if (trigger.closest('[data-more-features-trigger]')) return;
      setCreateNewPanelOpen(false);
    }
  };
  const timer = setTimeout(() => {
    document.addEventListener('mousedown', handler);
  }, 50);
  return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
}, [createNewPanelOpen, setCreateNewPanelOpen]);
```

该 handler 监听全局 mousedown，只要点击发生在 panel 之外且不在 `[data-more-features-trigger]` 元素内，立即关闭面板。后果：
- 用户点回输入框想接着打字 → 面板关
- 用户点 chat composer 的 +/模式/思考/模型按钮 → 面板关（这些按钮没有 data-more-features-trigger 标记）
- 用户点侧栏其它按钮 → 面板关
- 用户点消息列表 → 面板关

更糟的是 chat-composer.tsx 第 557-560 行：`if (opt.key === 'file') { setCreateNewPanelOpen(true); return; }`，即点击输入框"+"→"添加文件"也会打开 MoreFeaturesPanel。但这个 trigger 链路里没有任何元素带 data-more-features-trigger 标记，且 MoreFeaturesPanel 用 `fixed bottom-3 left-3 z-[60] w-60`（create-new-panel.tsx 第 314 行）固定在视口左下角——和用户刚刚点击的"输入框中央偏下"位置有明显的视觉错位。用户必须把视线/光标移到屏幕左下角才能操作面板，途中任何意外点击都会触发自动关闭。

补充：learning-store.ts 第 1354 行 `set({ activeFeatureView: view, activeFeatureViewDir: dir, createNewPanelOpen: false })` 会在选中某个 feature 时正确关闭面板（这是预期行为），不是问题。

【displayMode 状态调研】
- learning-store.ts 第 166 行：`displayMode: 'side' | 'half' | 'full'`，默认 `'side'`（第 369 行）。
- learning-store.ts 第 1339 行：`setDisplayMode: (mode) => set({ displayMode: mode, sidebarOpen: mode !== 'full' })` —— 切到 'full' 时自动隐藏侧栏。
- displayMode 只控制侧栏可见性，对输入框位置/高度/浮层行为没有任何直接影响。输入框的"脱离/扩展/收回"问题在三种 displayMode 下都存在。

【移动端表现调研】
chat-composer.tsx 中只有少量 sm: 断点（第 668、679、698、735 行），都是按钮尺寸/间距微调（h-8 w-8 → sm:h-7 sm:w-7），没有任何移动端专属的输入框高度/浮层定位逻辑。

移动端问题被放大：
- 浮层宽度 AttachMenu w-64 / ModeMenu w-72 / ThinkingMenu w-72 / ModelCardMenu w-80（chat-composer.tsx 第 988/1253/1320/1398 行），在 375px 视口下 ModelCardMenu（320px）几乎占满整屏。
- ModeMenu 的 `left-full top-0` 定位在移动端会把菜单推到 composer wrapper 右侧——而 composer 已占据接近全宽，菜单直接超出视口右边缘不可见。
- MoreFeaturesPanel 的 `fixed bottom-3 left-3 w-60`（240px）在 375px 视口下勉强放下，但和 trigger（输入框 + 按钮）的视觉距离仍很大。

【globals.css 排查】
src/app/globals.css（260 行）没有任何 textarea max-height / rows / .composer 等相关样式约束，确认所有高度限制都在 chat-composer.tsx 组件层。

【修复建议（仅供 Plan agent 参考，未做修改）】
1. 问题1：把四个浮层改为 createPortal + fixed + getBoundingClientRect 锚定到 trigger（参考 appearance-popover.tsx 第 75-87 + 126-133 行的实现），或把每个浮层移到各自 trigger 的 `relative` wrapper 内（去掉 composer card 的 overflow-hidden，或改用 visible/clip 区分横纵裁剪）。
2. 问题2&3：把 `maxH = expanded ? 320 : 140` 改为更宽裕的默认值（如 200/420），或彻底移除 maxHeight 改用 viewport 百分比（如 `min(scrollHeight, window.innerHeight * 0.5)`）。把"展开"按钮的触发条件从 `charCount > 280` 改为 `scrollHeight > maxH` 或始终显示一个手动展开入口。
3. 问题4：把 click-outside handler 改为仅在用户点击非交互区域时关闭（增加对 chat-composer 容器、sidebar 容器的豁免），或干脆改为只在 Esc/显式 X 按钮时关闭。如果是从 chat-composer 的 + → 添加文件 触发的，应把 MoreFeaturesPanel 的 fixed 定位改为锚定到 trigger 位置（参考 appearance-popover.tsx 的 portal 模式）。
