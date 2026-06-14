# 解决方案编制模型 v2

> 替代 v1「方案贯通」中仅接入 prompt 的半成品模型；编制（`ponyIds`）成为工作台场景、领队派单、招聘解雇的唯一真相源。

## Objective

建立「方案 = 编制（ponyIds）」模型：

- 进入某方案工作台只见该编制马
- 领队仅派编制内马
- 招聘/解雇与当前方案绑定
- 总办公室（`general-office`）与普通方案等价，无特权代码路径

## 数据模型

### 双表关系

- `ponies`：全局能力档案（能力、皮肤、builtin 标记）
- `solutions.json.ponyIds`：该方案编制（**工作台唯一可见来源**）
- `solutions.json.flow`：**内部字段**，保存时由 `ponyIds` 自动生成，UI 不展示

### 预置方案 seed

| 方案 id | ponyIds（seed） |
|---------|----------------|
| `general-office` | `['leader']`（用户手动勾选扩充） |
| `business-insight` | `leader, data, report` |
| `smart-marketing` | `leader, solution-marketing, data, writer, file` |
| `audit-automation` | `leader, solution-audit, data, writer` |

### 工作台上下文

- `activeSolutionId` 永不为 `null`，默认 `general-office`
- 移除「不限方案」特殊态

## 核心行为

### 工作台场景

`SceneCanvas` 按 `activeSolution.ponyIds` 过滤入驻/离席；工位招聘上限仍按全局 `OFFICE_CAPACITY`（小马表总数）。

### 领队派单

- `leaderSystem` / `dispatchToolDescription` 花名册 = 编制子集
- 编制外 `dispatch` 返回失败
- `formatSolutionLeaderHints` 仅保留 `leaderHints`、编制 id 列表、数据要求（不含 flow 链路）

### 保存方案

- 校验 `ponyIds ⊆ listPonies()`、必含 `leader`
- `flow = ponyIdsToFlow(ponyIds, ponies)`
- `demoStats.agents = ponyIds.length`（runs/success 保留演示假数）

### 招聘（方案上下文）

`hirePonyForSolution(solutionId, draft)`：

1. `savePony(draft)` → 小马表
2. 追加到 `solution.ponyIds` → `saveSolution`

### 解雇（方案上下文）

`dismissPonyFromSolution(solutionId, ponyId)`：

| 条件 | 行为 |
|------|------|
| `ponyId === 'leader'` | 拒绝 |
| builtin | 仅从当前方案 `ponyIds` 移除，不删表 |
| custom，其他方案仍引用 | 仅移编制 |
| custom，无其他引用 | 移编制 + `deletePony` |

数字员工中心：展示全表档案，仅编辑档案；编制调整走方案配置勾选；工作台模式才提供编制感知移除。

## 产品决策摘要（1–19）

1. 总办公室是普通 `Solution`，无特权逻辑
2. 工作台始终绑定 `activeSolutionId`
3. 一马可属于多方案编制
4. 工作台只渲染当前方案编制
5. `leader` 不可解雇；builtin 永不删表
6. `demoStats.runs/success` 仍为演示假数；`agents` 对齐 `ponyIds.length`
7. 数字员工中心仍展示小马表全部档案
8. 配置 UI 仅「数字员工编排」勾选，无 flow 节点 UI

## 成功标准

- [ ] 存在 seed 方案 `general-office`；`SolutionPicker` 无「不限方案」
- [ ] `SceneCanvas` 按编制过滤
- [ ] 带 `solutionId` 任务：领队花名册 = 编制子集；编制外 dispatch 失败
- [ ] 配置保存后 `flow` / `demoStats.agents` 与 `ponyIds` 一致
- [ ] 招聘编入当前方案；builtin 解雇不删表
- [ ] `npm run typecheck` 通过
