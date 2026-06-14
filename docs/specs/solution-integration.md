# Spec: 解决方案 × 数字员工 × 任务工作台贯通

## ASSUMPTIONS

1. 仍为 Electron 单机演示产品，不引入 Web 后端或多租户服务端。
2. 编排模型为「轻量可视化 flow + 领队马 LLM dispatch」，不实现全功能 DAG 画布，不硬编码步骤顺序。
3. `solutionId` 可选（未选时走现有通用 `leaderSystem`）。
4. 经营分析方案仅使用现有 `leader / data / report`；营销、稽核各新增 1 匹 `builtin: true` 方案演示马。
5. 运营总览 Metric、资源用量、方案卡片 `demoStats.runs/success`、Token/计费 **保持现有假数据**。
6. 本文件为 living doc；scope 变更时先更新 spec 再改代码。

---

## 1. Objective

**要做什么：** 把目前前端写死的 3 个「解决方案」变成主进程可持久化的真实配置，与 SQLite 数字员工花名册关联；用户从智能首页或企业控制台选择方案后，任务工作台以方案上下文执行（领队 prompt + 报表风格 + 日志徽章），数字员工档案在控制台与工作台实时同步。

**用户故事：**
- 演示者从控制台点「经营分析」→ 进入工作台，输入框预填默认任务 → 发布后经领队马按方案剧本派给 data马/报表马，Pixi 场景照常演出。
- 解决方案经理在企业控制台查看/编辑方案 flow 节点链并保存到 SQLite。
- 业务人员不选方案仍可发任务（兼容现有路径）。

**成功标准（可验收）：**
- [ ] SQLite 存在 `solutions` 表，首次启动 seed 3 套预置方案 + 2 匹方案马。
- [ ] `listSolutions()` / `saveSolution()` IPC 可用；`solution-create` 抽屉保存后重启仍一致。
- [ ] 首页与 ChatDock 使用同一 `SolutionPicker`，共享 `activeSolutionId`。
- [ ] 控制台点方案「进入工作台」：设置 `activeSolutionId`、预填 `defaultTaskTemplate`、**不自动 send**。
- [ ] `chat:send` 支持可选 `solutionId`；`null` 时行为与现版一致。
- [ ] 带 `solutionId` 的任务：`run_started` 含方案信息；LogBoard/工作台标题显示当前方案；`runs.solution_id` 落库。
- [ ] 经营分析真闭环不变：xlsx → data SQL → report HTML → 白板。
- [ ] 运营总览今日任务/Token/费用等 **仍为硬编码假数**；方案卡片 runs/success 仍读 `demoStats`。
- [ ] `npm run typecheck` 通过。

---

## 2. Tech Stack

- Electron + electron-vite + React 19 + TypeScript + Zustand
- 主进程：SQLite (`node:sqlite` DatabaseSync)、Vercel AI SDK、`src/main/agents/`
- 共享契约：`src/shared/types.ts`、`src/shared/ipc.ts`
- UI：`HomePage.tsx`、`CommercialDashboard.tsx`、`ChatDock.tsx`

---

## 3. Commands

```bash
npm install
npm run typecheck          # 必跑
npm run make-demo          # 经营分析演示数据
npm run dev                # 手动验收三页面与派单闭环
```

---

## 4. Project Structure（本特性涉及）

```text
docs/specs/solution-integration.md   # 本规格（living doc）
src/shared/types.ts                  # Solution / SolutionFlowNode 类型
src/shared/ipc.ts                    # SOLUTION_* channels, chatSend 扩展
src/main/db/index.ts                 # solutions 表、seed、runs.solution_id
src/main/db/solutions.ts             # 方案 CRUD 与校验
src/main/agents/prompts.ts           # leaderSystem / reportSystem 注入方案上下文
src/main/agents/index.ts             # startRun(solutionId)、run 元数据
src/main/ipc.ts                      # handler 注册
src/preload/index.ts                 # window.api 桥接
src/renderer/src/store/appStore.ts   # solutions、activeSolutionId、send 扩展
src/renderer/src/ui/SolutionPicker.tsx   # 共享组件
src/renderer/src/ui/HomePage.tsx
src/renderer/src/ui/ChatDock.tsx
src/renderer/src/ui/CommercialDashboard.tsx
src/renderer/src/App.tsx             # 工作台标题栏方案徽章
src/renderer/src/scene/SceneDirector.ts  # run_started 写 LogBoard 方案行
```

---

## 5. Code Style

- 共享类型只定义在 `src/shared/types.ts`，IPC 同步更新 `WindowApi`。
- DB seed 与 `PRESET_PONIES` 同风格：`INSERT OR IGNORE` 幂等。
- 方案校验用显式函数 + 抛错，不用 Zod 全量重写。
- UI 复用 `theme.css` 商业页 token，不硬编码新色值。

---

## 6. Testing Strategy

- 项目暂无完整测试脚本；本特性以 `npm run typecheck` + 手动验收为主。
- 建议后续补单元测试（非本阶段阻塞）：
  - `assertValidSolution` 校验
  - `formatSolutionLeaderHints(solution)` 输出格式

---

## 7. Boundaries

**Always：**
- 保持 main/preload/renderer/shared 分层；SQLite 仅主进程访问。
- 领队马仍为唯一编排入口；禁止 renderer 伪造派单成功。
- 方案相关失败透明报错，禁止假结果兜底。

**Never：**
- 硬编码固定 dispatch 顺序拦截
- 按方案换 Pixi 场景皮肤
- 把 Token/计费假数据写成「已计量」

---

## 8. 数据模型

### 8.1 Solution 类型

见 `src/shared/types.ts` 中 `Solution`、`SolutionFlowNode`、`SolutionId`。

### 8.2 DB

- 新表 `solutions (id TEXT PRIMARY KEY, json TEXT NOT NULL)`
- `runs` 迁移列 `solution_id TEXT`（可空）
- Seed 2 匹方案马（`builtin: true`）：`solution-marketing` 画像马、`solution-audit` 稽核马

### 8.3 三套预置方案

| id | ponyIds | 默认任务模板 |
|----|---------|-------------|
| `business-insight` | leader, data, report | 分析各营业厅业务表现并生成报告 |
| `smart-marketing` | leader, solution-marketing, data, writer, file | 基于现有客户数据筛选高价值营销目标，生成画像摘要和触达话术 |
| `audit-automation` | leader, solution-audit, data, writer | 稽核本批次校园赠送金调账工单，检查调账类型与备注是否一致，输出异常清单 |

---

## 9. 架构与数据流

**软约束注入点：**
- `leaderSystem(..., solution?)` 追加 `leaderHints` + flow 摘要
- `reportSystem(reportStyleHint?)` 在 `pony.id === 'report'` 时追加风格提示
- `genericSystem` 对 `solution-marketing` / `solution-audit` 使用 seed 中的 `role`

**AgentEvent 扩展（向后兼容，可选字段）：**

```typescript
| { type: 'run_started'; runId: string; userQuery: string; solutionId?: string; solutionTitle?: string }
```

---

## 10. UI 行为

| 入口 | 行为 |
|------|------|
| 智能首页 · 发布任务 | `SolutionPicker`（含「不限方案」）；选中后 `send(text, 'task', solutionId)` |
| 任务工作台 ChatDock | 同一 `SolutionPicker` + 顶栏「当前方案：xxx」 |
| 控制台 · 解决方案卡 | 读 `appStore.solutions`；`demoStats` 展示假 runs/success；「进入工作台」预填模板 |
| 控制台 · 配置抽屉 | 横向 flow 节点链；保存调用 `saveSolution` |
| 运营总览 | **不改**假 Metric / 假 Activity / 假 Token |

---

## 11. Open Questions

- 无阻塞项。
