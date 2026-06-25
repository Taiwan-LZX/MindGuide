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
