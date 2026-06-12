# 小马办公室（Pony Office）Agent 开发指南

本文件面向后续进入 `D:\marvis` 的 Codex/Agent。请先读本文件，再读 `TODO.md`、`prd.md` 和相关代码。默认使用中文沟通和提交说明，除非用户明确要求英文。

## 项目定位

- 产品是一个 Marvis 式多 Agent 桌面应用：用户只和「领队马」对话，领队马把任务派给数据马、报表马、文件马、文书马等职能小马。
- 核心演示链路必须真实闭环：`xlsx 上传 -> SQLite 入库 -> 数据马 text-to-SQL -> 报表马生成 ECharts HTML 报告 -> 报告面板/PDF/归档`。
- 这是演示级产品，但禁止假演示。失败时要透明报错、重试、优雅认错，不得生成隐藏兜底假结果。
- 目标场景是电信培训演示，演示数据集中在 `assets/demo/`，真实用户上传和 fixture 必须明确区分。

## 任务源优先级

1. 用户当前明确要求。
2. 本 `AGENTS.md` 的仓库规则。
3. `TODO.md` 的未完成项、架构边界、验收标准。
4. `prd.md` 的产品目标和里程碑。
5. 当前代码事实。

注意：`TODO.md` 中“当前代码观察”不等于已验收完成。只有功能项已经实现、验证通过，并按项目约定写回文档后，才可以把对应待办视为完成。

## 当前技术栈

- 桌面壳：Electron + electron-vite。
- 前端：React + TypeScript + Zustand + PixiJS v8。
- 主进程能力：Vercel AI SDK、OpenAI-compatible LLM、MCP stdio 托管、SQLite、SheetJS、ECharts 报告 HTML、Electron `printToPDF`。
- 当前数据库实现使用 `node:sqlite` 的 `DatabaseSync`。不要因为 PRD 曾写 `better-sqlite3` 就随意迁移数据库层。
- 包管理以现有 `package-lock.json` 为准，优先使用 npm。

常用命令：

```bash
npm install
npm run make-demo
npm run dev
npm run typecheck
```

仓库目前没有完整测试脚本时，不要声称测试已全部通过。至少运行可用的 `npm run typecheck`；若未运行或失败，需要在最终回复里说明。

## 目录与边界

- `src/main/`：唯一可信执行边界。负责 LLM、Agent 编排、SQLite、MCP、文件系统、xlsx 解析、报告生成、PDF 导出、日志脱敏。
- `src/preload/`：只暴露最小白名单 API。新增跨进程能力时，先更新 `src/shared/ipc.ts` 和 `WindowApi`，再在 preload 中桥接。
- `src/renderer/`：纯 UI。负责 React 面板、Pixi 场景、状态展示和用户输入，不直接访问 Node API、`.env`、文件系统、SQLite 或 MCP。
- `src/shared/`：主进程、preload、renderer 共享的类型和 IPC 契约，是接口标准来源。
- `src/main/agents/`：领队马和职能小马执行流。任何 Agent 行为变更都要保持事件流可观察。
- `src/main/db/`：SQLite schema、预置小马、Skill、MCP 配置、报告、聊天历史和上传数据表。
- `src/main/mcp/`：MCP server 解析、启动、工具发现和调用代理。
- `src/main/skills/`：工作区 Skill 格式、扫描、脚本工具。
- `src/renderer/src/scene/`：Pixi 办公室、小马、动画事件消费。
- `src/renderer/src/ui/`：React UI 面板，如输入栏、任务日志、报告、小马配置、招聘、设置。
- `skills/`：项目内 Skill 示例和用户可扩展 Skill。Skill 是能力说明和脚本入口，不应绕过主进程安全边界。

## 架构硬规则

- 保持 `main / preload / renderer / shared` 分层；不要把高权限逻辑放进 renderer。
- BrowserWindow 必须保持 `contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`。如调整 `sandbox`，需说明兼容性原因。
- 不引入传统 Web 后端；本项目的本地可信执行边界是 Electron 主进程。
- IPC channel 必须集中在 `src/shared/ipc.ts`；新增 API 要同步更新 `WindowApi`、preload、main handler 和调用方。
- Agent 事件流是动画和任务日志的唯一事实源。renderer 可以展示事件，不能伪造任务成功、SQL 执行、工具调用或报告生成状态。
- `AgentEvent` 扩展时要同时检查 `TaskLog`、`SceneDirector`、store 和日志记录。
- SQLite 只能在主进程访问；上传的 xlsx 数据表与系统表保持隔离。
- MCP server 只能由主进程 stdio 托管、测试和调用；renderer 不得直接启动、停止或调用 MCP。

## Agent 编排规则

- 领队马负责理解意图、拆任务、调用 `dispatch(to, brief)` 派单、汇总结果。
- 用户只与领队马对话；不要新增直接私聊其他小马的主入口，除非 TODO/PRD 明确改变。
- 数据分析类任务必须覆盖核心路径：`leader -> data -> report -> leader`。
- 如果任务需要真实执行，领队马最终回复只能基于子任务和工具返回结果。没有派单或工具结果时，不得汇报已完成。
- 职能小马必须有清晰角色、输入、输出和失败方式；新增小马或工具时，要能被花名册和日志解释清楚。
- 派单目标应使用小马 id，必要时兼容名称解析，但不要让模型依赖模糊昵称。
- Skill 注入 system prompt；能力型扩展走 MCP 或受控的 Skill script tool，不另建随意插件体系。
- 风险操作需要人类确认：删除、覆盖、移动、越界文件、启动带写权限的 MCP server、取消正在运行的任务等。

## 数据、SQL 与报告

- xlsx 解析使用 SheetJS，入库前要校验文件类型、可读性、空表、重复列、特殊字符列。
- 数据表命名和列名必须安全转义；失败时不要留下误导后续分析的半成品。
- SQL 只允许单条 `SELECT` 或 `WITH ... SELECT`。必须通过 `src/main/agents/sqlGuard.ts` 或等价守卫，拒绝 DDL/DML、多语句、`PRAGMA`、`ATTACH` 等危险语句。
- SQL/工具失败最多自动重试 2 次；每次失败都要进入事件流或日志摘要。
- 报告生成应逐步收敛为结构化 `ReportSpec -> schema 校验 -> 固定 HTML 模板 -> ECharts`。当前如继续使用 HTML 片段，也必须经过主进程模板和清洗。
- 报告不得加载远程脚本或 CDN。图表依赖应使用本地资源或受控模板。
- 报告内容必须来自本轮真实分析结果；禁止用预制成功报告冒充真实分析。

## 安全与隐私

- 不要读取、展示、提交或硬编码 `.env` 中的密钥。
- API key、token、password、Authorization、MCP env、用户上传数据日志都要脱敏并限制长度。
- 不要把 OpenAI-compatible API key 放进 renderer 或前端 bundle。
- `.env` 不得提交；需要配置时更新 `.env.example`。
- filesystem MCP 和文件马能力必须限定在工作区内。写入前 canonicalize 路径并防止 `../`、符号链接逃逸和工作区外路径。
- 覆盖或删除文件前必须确认；用户取消时要作为正常失败路径处理。
- 外部工具结果、上传文件、LLM 输出都视为不可信输入。

## 前端与体验规则

- 首屏是可用的办公室应用，不做营销落地页。
- 场景层用 PixiJS canvas：办公室、小马、气泡、光影、动画、白板入口。
- UI 层用 React：输入栏、任务日志、报告面板、小马配置、招聘表单、设置。
- 设计风格保持“有机极简主义 x 高级室内设计”：亚麻白、燕麦、驼色、赭石、鼠尾草绿、赤陶、黄铜金。
- 优先复用 `src/renderer/src/theme.css` 的设计 token；不要在组件中散落硬编码颜色。
- 小马、办公室、配件优先用 Pixi Graphics 程序化矢量；不要引入远程图库作为默认依赖。
- 功能图标优先使用项目约定的图标库；不要用 emoji 充当功能图标。
- 覆盖默认态、空态、加载态、成功态、错误态、未配置态。
- 关键视口验收目标：1280 x 800 下场景、输入栏、日志、白板、报告面板不互相遮挡；TODO 中更高标准优先。

## 文档和进度写回

- 开发任务优先从 `TODO.md` 未完成项中选取，并保持小步可验收。
- 完成某个 §2.x 功能块前，必须对照该块验收标准逐项验证。
- 不要随意勾选 TODO。只有实际验证通过，才更新复选框和“开发进度”。
- 当某 §2.x 全部完成并验证后，按 TODO 说明归档到未来 `prd/<模块>/README.md` 和 `prd/<模块>/technical.md`。
- 更新 PRD/TODO/AGENTS/CLAUDE 等文档时，必须基于当前代码事实，不要复制过期规划。
- 如果变更了架构边界、IPC 契约、AgentEvent、数据模型或安全策略，必须同步更新相关文档。

## 代码风格

- 优先 TypeScript，保持类型边界清晰。
- 共享接口放在 `src/shared/`，不要在 main 和 renderer 分别定义一套近似类型。
- 使用 Zod 或显式校验处理 LLM/tool 输入，避免直接信任模型输出。
- 优先小而清晰的函数；只有在降低真实复杂度时才抽象。
- 遵循现有代码风格，不做与当前任务无关的大重构。
- 不要硬编码用户机器路径。工作区路径、模型配置、MCP 配置都应来自配置层或 Electron app data。
- 修改已有文件前先理解现有实现；工作树可能包含用户未提交改动，不要回滚不属于你的修改。

## 验证清单

每次改动后按风险选择验证：

- 类型边界：`npm run typecheck`。
- 演示数据：`npm run make-demo` 后确认 `assets/demo/电信业务数据.xlsx` 可用于导入。
- Electron 安全：renderer 不能访问 `fs`、`process`、`child_process`、原始 `ipcRenderer` 或 `.env`。
- Pixi 场景：canvas 非空、idle 动画有帧变化、关键 UI 不遮挡。
- xlsx：正常电信数据可导入；非 xlsx、损坏文件、空表被拒绝。
- SQL：`DROP`、`DELETE`、`INSERT`、`UPDATE`、多语句被拒绝；失败重试最多 2 次。
- Agent：典型任务产生 `task_dispatched`、`tool_call_started`、`tool_call_finished`、`task_completed` 或 `task_failed`。
- 报告：报告含真实分析结论、至少一个图表、可打开、可导出 PDF。
- MCP/filesystem：只能访问工作区，越界路径和符号链接逃逸被拒绝，删除/覆盖取消能正确处理。
- 失败演示：断网、API 超时、SQL 错误、MCP 失败时应用不崩溃，日志和动画状态一致。

最终回复要说明已改文件、运行过的验证命令和结果；如果没有运行验证，也要明确说明原因。
