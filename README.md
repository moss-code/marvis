# 翼智小马（Pony Office）

一款基于 Electron 的企业多 Agent 桌面应用。用户通过智能首页与「领队马」交互；领队马作为主 Agent 理解需求、做出决策，并在任务模式下把子任务分配给数据马、报表马、文书马、文件马或自定义数字员工。完整执行过程会在 2D 任务工作台中实时呈现。

详细产品定义见 [prd.md](./prd.md)。

## 当前功能

- **智能首页**：登录后的默认入口，支持主 Agent 直接问答和任务发布。
- **双交互模式**：直接咨询由主 Agent 即时回答；发布任务时强制经过主 Agent 决策与派单。
- **小马团队状态**：首页展示真实数字员工花名册，并根据任务事件显示待命或工作状态。
- **文件与数据资源**：支持上传 `xlsx`、`xls`、`csv`、`txt`，可选择本轮使用的数据表。
- **任务工作台**：用 PixiJS 场景展示领队派单、小马移动、工具调用、任务完成和报告生成。
- **企业控制台**：提供运营总览、解决方案、数字员工、用量计费、安全审计等管理界面。
- **数字员工管理**：支持招聘、编辑和删除自定义小马，并为其绑定 Skill 与 MCP 服务。
- **报告与历史**：支持 HTML 可视化报告、PDF 导出、任务日志、任务历史及过程回放。
- **模型配置**：兼容 OpenAI 协议的模型服务，可在设置中维护地址、密钥和模型名称。

## 工作流程

```text
用户
  ↓
智能首页 / 主 Agent（领队马）
  ├─ 直接咨询：主 Agent 直接生成回答
  └─ 发布任务：分析目标并调用 dispatch
                     ↓
              数据马 / 报表马 / 文书马 / 文件马 / 自定义马
                     ↓
              工具、Skill、MCP 与数据资源
                     ↓
              主 Agent 汇总并向用户汇报
```

任务工作台负责将派单和执行过程可视化，实际决策始终由主 Agent 完成。

## 技术栈

- Electron + electron-vite
- React 19 + TypeScript + Zustand
- PixiJS 8
- Vercel AI SDK + OpenAI Compatible Provider
- MCP SDK
- SQLite / SheetJS
- ECharts

## 快速开始

```bash
npm install
npm run make-demo   # 生成演示数据 assets/demo/电信业务数据.xlsx
copy .env.example .env   # 填写国内模型的 OpenAI 兼容接口配置
npm run dev
```

在 `.env` 或应用设置中填写兼容 OpenAI 协议的模型服务配置。

## 基本使用

1. 登录后进入智能首页。
2. 选择「直接咨询」，可直接向主 Agent 提问。
3. 需要执行数据分析、生成报告或调用工具时，选择「发布任务」。
4. 可先上传 `assets/demo/电信业务数据.xlsx`，再输入“分析各营业厅业务表现并生成报告”。
5. 发布后自动进入任务工作台，查看主 Agent 派单和小马协作过程。
6. 报告完成后可在工作台打开并导出 PDF。

历史对话在首页默认合并折叠，可按需展开；企业控制台和任务工作台均可返回智能首页。

## 项目结构

```text
src/
  main/                 Electron 主进程、Agent、数据库、MCP、报告
  preload/              安全暴露给渲染进程的 IPC API
  renderer/src/
    ui/                  首页、控制台、工作台面板
    scene/               PixiJS 办公室场景与小马角色
    store/               Zustand 全局状态
  shared/                主进程与渲染进程共享类型及 IPC 契约
skills/                  工作区 Skill
assets/demo/             演示数据
docs/                    接口、实施与演示文档
```

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发模式 |
| `npm run build` | 构建应用 |
| `npm run typecheck` | 检查主进程和渲染进程类型 |
| `npm run make-demo` | 重新生成演示数据 |
| `npm run dist` | 构建并打包桌面安装程序 |
