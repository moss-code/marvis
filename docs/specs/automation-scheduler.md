# Spec: 企业控制台自动化（定时任务）

Living document — 实现以代码为准；scope 变更先更新本文件。

## ASSUMPTIONS

1. 单机 Electron，调度在主进程，不引入 Web 后端。
2. **方案任务** → `mode: 'task'` + `solutionId`；**主 Agent 任务** → `mode: 'chat'` + 持久化 `skillIds`/`mcpServerIds`。
3. 附件复制到 `WORKSPACE_DIR/automation/{jobId}/`。
4. 托盘后台继续调度。
5. 与手动任务冲突时自动化任务**排队**，上限 3。
6. Job 可开启 `ignoreRisk`，治理层自动放行并写 audit。
7. 应用内 + 桌面通知必做；微信等留接口。

## Objective

企业控制台「自动化」：创建/编辑/暂停定时任务，到点执行 Agent，执行后通知。

## Success Criteria

- SQLite：`automation_jobs`、`notifications`；`runs` 含 `trigger`、`automation_job_id`
- 主进程 scheduler + queue + executor
- 方案 task / 主 Agent chat 双模式
- `ignoreRisk` 自动放行 + audit
- 控制台 UI + 真实通知 drawer
- `npm run typecheck` 通过

## Commands

```bash
npm install
npm run typecheck
npm run make-demo
npm run dev
```

## Boundaries

**Always:** main/preload/renderer/shared 分层；复用 `startRun`；失败透明报错。

**Never:** renderer 内调度 Agent；静默绕过 audit；本阶段接真实微信 API。

See plan attachment for full data model, IPC, and UI details.
