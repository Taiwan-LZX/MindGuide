# MindGuide 部署交接文档

## 项目当前状态描述/判断

**项目名称**: MindGuide — AI 对话式学习平台
**源仓库**: https://github.com/Taiwan-LZX/MindGuide.git
**部署状态**: ✅ 已成功部署并验证

### 部署概览
- **框架**: Next.js 16.1.3 (App Router, Turbopack)
- **语言**: TypeScript 5 (strict)
- **样式**: Tailwind CSS 4 + shadcn/ui
- **数据库**: Prisma ORM + SQLite (`db/custom.db`)
- **AI**: z-ai-web-dev-sdk (backend only)
- **编辑器**: Tiptap v3 (17 extensions)
- **状态**: 运行在 http://localhost:3000 (端口 3000)

### 部署完成的功能模块
1. **首页**: Welcome 视图 + 学习主题快速入口
2. **侧边栏**: 会话列表 + 搜索 + 创建新主题
3. **AI 对话教学**: SSE 流式响应 + 苏格拉底式追问
4. **知识图谱**: 自动追踪知识点掌握状态
5. **富文本笔记**: Tiptap 编辑器（17 extensions）
6. **课程生成**: AI 自动生成结构化课程
7. **成就系统**: 学习激励
8. **学习统计**: 可视化学习轨迹

### 数据库模型
- `LearningSession`: 学习会话（active/paused/completed/archived）
- `LearningMessage`: 对话消息（user/assistant/system）
- `KnowledgeNode`: 知识节点（带 importance 1-5 + mastered 状态）
- `Reference`: 参考资料

### API 路由（8 个）
- POST `/api/chat` — AI 对话 + 流式响应 ✅
- POST `/api/course/generate` — AI 课程生成 ✅
- GET/POST `/api/sessions` — 会话 CRUD ✅
- GET/PATCH/DELETE `/api/sessions/[id]` ✅
- GET/DELETE/POST `/api/sessions/[id]/messages` ✅
- GET/POST `/api/sessions/[id]/knowledge` ✅
- GET/POST `/api/sessions/[id]/references` ✅
- PATCH `/api/knowledge/[id]` — 知识点 toggle ✅

---

## 当前目标 / 已完成的修改 / 验证结果

### 已完成的部署步骤
1. ✅ 克隆 MindGuide 仓库到 `/tmp/mindguide-source`
2. ✅ 备份并清理原有的占位代码
3. ✅ 复制源码（src/、prisma/、public/、keep-server.sh、Caddyfile）
4. ✅ 安装 21 个缺失依赖：
   - `@tiptap/*` (16 packages, v3.27.1)
   - `highlight.js@11`、`katex@0.17`、`lowlight@3`
   - `rehype-katex@7`、`remark-math@6`
5. ✅ 初始化 Prisma 数据库 (`bun run db:push`)
6. ✅ 通过 `bun run lint` 检查（零错误零警告）
7. ✅ 启动 dev server（使用 daemonize.py 双 fork 守护进程，详见下文）
8. ✅ 通过 agent-browser + VLM 完成端到端验证

### 关键技术决策：daemonize.py 守护进程
**问题**: 沙箱环境中使用 `nohup ... &` + `disown` 启动的 Next.js dev server 会在父 shell 退出时被 SIGKILL，导致每次 bash 命令结束后服务器都死掉。`setsid`、`nohup`、`disown`、keep-alive 脚本均无法解决（父 shell 退出时整个进程组被回收）。

**解决方案**: 编写 `/home/z/my-project/daemonize.py`，使用经典 double-fork daemon 模式：
1. 第一次 `os.fork()` → 父进程退出
2. `os.setsid()` → 创建新会话，脱离控制终端
3. 第二次 `os.fork()` → 子进程退出，孙进程被 init (PID 1) 收养
4. 重定向 stdin/stdout/stderr 到 `/dev/null` 和 `dev.log`
5. `os.execvpe("next", ["next", "dev", "-p", "3000"], env)` 替换进程映像

启动命令：
```bash
python3 /home/z/my-project/daemonize.py next dev -p 3000
```

进程 PID 5025 (`next-server`)，PPID 为 1（init），完全脱离调用 shell，在 bash 命令之间稳定存活。

### 验证结果
1. **首页渲染**: ✅ Layout 正确（侧边栏 20% + 主区域 80%），所有 UI 组件正常显示
2. **创建学习会话**: ✅ 输入"Python 编程基础" → 点击提交 → 新会话创建成功（POST /api/sessions 200）
3. **AI 对话教学**: ✅ 发送消息 → POST /api/chat 200 in 3.0s → AI 返回苏格拉底式追问响应
4. **Markdown 渲染**: ✅ 编号列表、emoji、段落结构正确渲染
5. **数据持久化**: ✅ AI 响应后客户端成功 re-fetch messages/knowledge/references
6. **VLM 视觉验证**: ✅ 截图分析确认"页面渲染正确，无错误，无破损布局"

### 验证日志摘录
```
GET / 200 in 3.1s (compile: 2.3s, render: 824ms)
GET /api/sessions 200 in 135ms
POST /api/sessions 200 in 11ms
GET /api/sessions/[id]/messages 200 in 984ms
POST /api/chat 200 in 3.0s (render: 2.8s)
GET /api/sessions/[id]/messages 200 in 55ms  (re-fetch after AI response)
```

---

## 未解决问题或风险，建议下一阶段优先事项

### 已知限制（来自源项目 PROJECT.md）
| 项目 | 说明 |
|------|------|
| 笔记持久化 | `notesContent` 仅存内存，刷新丢失 |
| 成就系统 | 仅展示，无解锁逻辑 |
| 课程持久化 | 课程仅存内存，无 Prisma 模型 |
| 认证 | 无用户认证，所有 API 公开 |
| 真流式 | AI 调用为同步，响应后模拟分块流式 |

### 部署相关风险
1. **内存压力**: next-server 编译后占用 ~1.4GB RAM。已通过 `NODE_OPTIONS="--max-old-space-size=2048"` 提高 V8 堆上限。若沙箱后续内存紧张，可能需要降到 1024 或拆分模块。
2. **进程守护**: 当前依赖 daemonize.py 启动；若沙箱重启或 next-server 自身崩溃，需要手动重启。建议下一阶段在 daemonize.py 中加入 watchdog 逻辑（监听端口 + 自动重启）。
3. **Chrome 残留**: agent-browser 多次调用会残留 Chrome 子进程，吃内存。建议定期 `pkill -9 -f "chrome"`。

### 下一阶段优先建议
1. **【高】增强 daemonize.py**: 加入 watchdog 循环，每 10s 检查端口 3000 健康度，崩溃自动重启。
2. **【高】笔记持久化**: 新增 Prisma 模型 `Note`（sessionId, content, updatedAt），在 store 中持久化 notesContent。
3. **【高】课程持久化**: 新增 Prisma 模型 `CourseModule` + `Lesson`，让生成的课程在刷新后仍存在。
4. **【中】真流式**: 将 `/api/chat` 改为真实 SSE 流（z-ai-web-dev-sdk 的 stream 模式），而不是同步返回后模拟分块。
5. **【中】成就解锁逻辑**: 实现"首次创建会话"、"完成 5 次对话"、"掌握 10 个知识点"等触发条件。
6. **【中】UI 细节增强**: 当前 UI 已较完整，可继续打磨加载骨架屏、错误边界、移动端响应式。
7. **【低】认证系统**: 接入 NextAuth.js v4，限制 API 访问。

### 关键文件位置
- 守护进程启动器: `/home/z/my-project/daemonize.py`
- Keep-alive 脚本（备用）: `/home/z/my-project/keep-server.sh`
- Dev 日志: `/home/z/my-project/dev.log`
- 守护进程日志: `/tmp/mindguide/server.log`
- 数据库: `/home/z/my-project/db/custom.db`
- Prisma schema: `/home/z/my-project/prisma/schema.prisma`
- 项目文档: `/home/z/my-project/PROJECT.md`、`/home/z/my-project/README.md`

---

## 第二轮迭代 — UI 平面化 + 更多功能细节 (用户反馈驱动)

### 触发与判断
用户反馈："更多功能那里希望更简约、更自然、更平面一点，不用画那么多复杂的结构，整体画风立体度太高了，应该更平面自然一点"

通过 agent-browser 打开"更多功能"弹窗并使用 VLM 分析，确认原设计存在以下立体化问题：
1. **凹槽内容区** (recessedBg)：浅灰背景层 + 内部白色卡片 → 双层结构
2. **图标内嵌凹槽** (inset shadow)：每个图标被放在带 `shadow-[inset_0_1px_2px]` 的井里 → 凸起/凹陷错觉
3. **多层复合阴影**：`shadow-[0_4px_12px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06)]` → 浮起感过强
4. **卡片边框+凹槽阴影**：每个功能项是独立的白色圆角卡片带 inset shadow
5. **侧边栏触发按钮**：`bg-white shadow-sm` 也有轻微浮起

### 已完成的修改

**1. 重写 `create-new-panel.tsx`（核心修复）**
- 删除整套 Design Tokens `T` 对象（recessed/groove/itemGroove/itemHoverShadow 等）
- 移除凹槽内容区：列表区背景与面板同色，不再有浅灰凹陷层
- 移除图标凹槽井：图标直接 inline，无容器无 inset shadow
- 改为 macOS 原生菜单风格的扁平行：`hover:bg-neutral-100` + 无边框 + 无阴影
- 头部从双层(cream header bg + content recessed)改为单层 flat header
- 关闭按钮从"灰色圆形浮起"改为"hover 时浅灰方块"
- 面板阴影从复合多层简化为 `shadow-sm` + `backdrop-blur-md`（毛玻璃）
- 标题样式改为 `uppercase tracking-wider` 小标签风

**2. 平面化侧边栏触发按钮 (`sidebar.tsx`)**
- "更多功能"按钮：`bg-white shadow-sm` → `border border-neutral-200`（ghost/outline 风格）
- "创建新主题"按钮：`shadow-sm hover:shadow-md` → 纯色 + `hover:bg-neutral-800`（无阴影）

**3. 平面化 feature-views.tsx 中的残留立体元素**
- 成就系统：移除已解锁图标的 `shadow-md shadow-neutral-900/20`；移除卡片 `bg-gradient-to-r` 渐变 → 纯色 `bg-neutral-50/80`；`transition-all` → `transition-colors`
- 学习统计：移除火焰图标的 `shadow-lg shadow-neutral-900/20`；移除 hero 卡片 `bg-gradient-to-br` 三段渐变 → 纯色 `bg-neutral-50/60`

**4. 新增功能细节（平面化基础上的增强）**
- **键盘快捷键**：⌘/Ctrl + 1~6 快速跳转对应功能，Esc 关闭面板
- **快捷键提示 UI**：每行 hover 时显示 `⌘1` 等 kbd 徽标（macOS 原生风格，无边框浮起）
- **底部状态栏**：显示快捷键提示文案 + 功能项总数
- 这些细节都是平面文字/边框，不引入任何 3D 元素

### 验证结果
- `bun run lint` ✅ 零错误零警告
- agent-browser + VLM 视觉验证：
  - "更多功能"弹窗："无3D立体感、内凹凹槽或凸起卡片，风格平面自然简约；图标直接inline显示；整体层次单一清爽；与左侧栏协调一致" ✅
  - 成就系统页："整体平面自然，无明显3D阴影或渐变立体感；已解锁成就图标无凸起阴影" ✅
  - 学习统计页："整体平面自然简约；火焰图标所在方块无突兀3D阴影" ✅
  - 快捷键提示 + 底部状态栏："底部有快捷键提示(⌘1-6)；整体符合macOS原生菜单风格" ✅
- 快捷键功能端到端测试：`agent-browser eval` 派发 ⌘3 keydown → 自动跳转成就系统页 + 面板自动关闭 ✅

### 当前项目状态
- Dev server: PID 7381，运行在 http://localhost:3000，PPID=1（daemonize.py 守护），稳定
- 核心 QA 全通过：首页渲染、会话创建、AI 对话、知识图谱、笔记、成就、统计、键盘快捷键
- UI 风格统一为：扁平 + 中性色 + 微妙边框 + 无 3D 阴影（仅 popover 保留 `shadow-sm` 用于浮层区分）

### 未解决问题 / 下一阶段建议
1. **【中】真流式**：`/api/chat` 仍为同步调用后模拟分块，建议改用 z-ai-web-dev-sdk stream 模式
2. **【中】笔记/课程持久化**：notesContent 与生成的课程仅存内存，刷新丢失（需新增 Prisma 模型）
3. **【中】成就解锁触发**：当前成就进度从 /api/stats 实时计算（已工作），但可补充"解锁瞬间"的 toast/动画反馈
4. **【低】认证系统**：接入 NextAuth.js v4
5. **【低】daemonize.py watchdog**：加入端口健康检查 + 崩溃自动重启

### 关键文件变更清单
- `src/components/learning/create-new-panel.tsx` — 完全重写为扁平 + 快捷键
- `src/components/learning/sidebar.tsx` — 两个底部按钮扁平化
- `src/components/learning/feature-views.tsx` — 成就/统计页移除阴影与渐变

---

## 第三轮迭代 — 悬停跟随动画 + 学术论文风全局改造 (用户反馈驱动)

### 触发与判断
用户反馈两点：
1. 「更多功能」悬停时希望保留柔和方框 + 跟随动画，而不是"纯文本贴上去"的僵硬感
2. 整个项目要专业、平面、论文风 — 移除彩色图标、emoji、表现符号(🏆🔥✓○●等)

### 已完成的修改

**1. 重写「更多功能」面板悬停交互 (`create-new-panel.tsx`)**
- 之前：`hover:bg-neutral-100` 硬切换 → 文字贴上去的僵硬感
- 现在：分层动画方案
  - 高亮层：绝对定位 `<motion.span>` 圆角矩形，`opacity` 淡入 + 微 `scale` 过渡（0.985→1），产生"沉降"感而非硬矩形出现
  - 左侧细线：`<motion.span>` 2px 竖线，hover 时 `opacity + scaleY` 弹入，作为"选中"提示
  - 图标：`whileHover={{ x: 1 }}` spring 弹簧右移
  - 箭头：`whileHover={{ x: 2 }}` spring 右移
  - 所有过渡用 `spring stiffness:400 damping:22-26`，自然跟随不僵硬

**2. 全局学术论文风改造**

*WelcomeView (`main-content.tsx`)*
- Logo：`bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg` → `border border-neutral-200 bg-white`（黑白边框）
- 标题：`font-semibold` → `font-serif font-medium`（衬线字体 scholarly）
- 快捷主题：移除所有 emoji（🧠⚡🏗🎨🌐），改为纯文字按钮
- 按钮形状：`rounded-full` → `rounded-md`（更方正学术）
- hover：`scale 1.04` 弹跳 → `y: -1` 微妙上浮

*成就系统 (`feature-views.tsx`)*
- 移除 `🏆 全部解锁！恭喜！` → `全部解锁`
- 移除已解锁角标 `bg-emerald-500` 圆形 ✓ 徽章
- 「已解锁」徽章：`bg-emerald-100 text-emerald-700` → `border border-neutral-200 text-neutral-600`（中性边框）
- `transition-all` → `transition-colors`

*学习统计 (`feature-views.tsx`)*
- 移除 `🔥 保持下去！` → `保持下去`
- 移除 hero 火焰图标块（`Flame` 装饰性表现符号）
- 「已掌握」徽章：`bg-emerald-50 text-emerald-700` → `border border-neutral-200 text-neutral-600`
- 流式指示器：`bg-emerald-400` → `bg-neutral-500`

*知识图谱 (`feature-views.tsx`)*
- 掌握状态：`✓` / `○` 文字符号 → `<Check>` lucide 图标 / 中性边框圆点
- 重要度：`●●●○○` 表现符号 → `3/5` 数字 tabular-nums

*侧边栏品牌 (`sidebar.tsx`)*
- Logo：`bg-neutral-900` 实心黑方块 → `border border-neutral-200` 中性边框
- 品牌名：`font-semibold` → `font-serif font-medium tracking-tight`

*笔记编辑器 (`tiptap-editor.tsx`)*
- 「已保存」状态：`text-emerald-600` → `text-neutral-500`

*AI 系统提示词 (`api/chat/route.ts`)*
- 移除「用emoji来增加亲和力」
- 新增「不要使用 emoji 或装饰性符号（如 ✨🎉🔥💡 等），保持克制的书面语风格」

*成就解锁 toast (`learning-store.ts`)*
- `🏆 成就解锁：` → `成就解锁：`
- toast 边框：`border-emerald-200` → `border-neutral-200`

### 验证结果
- `bun run lint` ✅ 零错误
- agent-browser + VLM 逐页验证：
  - 首页："无彩色图标或emoji；Logo为黑白单色边框；标题为衬线字体；快捷主题按钮只有文字；整体专业学术平面" ✅
  - 更多功能悬停："悬停行有柔和圆角高亮方框；高亮有淡入过渡；平面不僵硬" ✅
  - 成就系统："无emoji或彩色徽章；已解锁角标已移除；整体黑白学术风" ✅
  - 学习统计："顶部连续学习卡片无火焰图标或emoji；整体克制黑白学术风；无彩色残留" ✅
  - 知识图谱："掌握状态用对勾；重要度用数字；整体学术平面风" ✅
  - 会话界面："MindGuide品牌为衬线字体+黑白边框；头像单色；整体专业学术平面" ✅
  - AI 新回复："最新AI回复无emoji；为克制书面语" ✅（旧消息含emoji是历史缓存，新提示词已生效）

### 当前项目状态
- Dev server 稳定运行 (PID 7381, port 3000)
- UI 风格统一：衬线标题 + 中性灰阶 + 边框 + 无 emoji/彩色/表现符号
- 真流式 SSE + 思考气泡 + 成就解锁 toast + 键盘快捷键 全部工作

### 未解决问题 / 下一阶段建议
1. **【中】历史消息残留 emoji**：旧 AI 回复含 emoji 仍显示在对话历史中，可考虑加一个客户端 sanitize 过滤（可选，保留历史真实性）
2. **【中】笔记/课程持久化**：已部分实现（notes 有 DB 模型），课程仍需补 Prisma 模型
3. **【低】认证系统**：NextAuth.js v4
4. **【低】daemonize.py watchdog**：端口健康检查 + 自动重启

### 关键文件变更清单
- `src/components/learning/create-new-panel.tsx` — 悬停分层动画重写
- `src/components/learning/main-content.tsx` — WelcomeView 学术化（衬线+黑白logo+无emoji主题）
- `src/components/learning/feature-views.tsx` — 成就/统计/知识图谱移除 emoji+彩色
- `src/components/learning/sidebar.tsx` — 品牌衬线+边框
- `src/components/learning/tiptap-editor.tsx` — 保存状态中性化
- `src/app/api/chat/route.ts` — 系统提示词禁用 emoji
- `src/store/learning-store.ts` — 成就 toast 中性化
