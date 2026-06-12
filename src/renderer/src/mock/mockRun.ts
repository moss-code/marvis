import type { AgentEvent } from '@shared/types'
import { logSummary } from '@shared/logSummary'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * M1 验收用：mock AgentEvent 序列，验证「事件协议 → 场景动画 + 任务日志」链路。
 * M2 接入真实事件流后，此模块仅保留为开发期动画调试入口（仅 DEV 可见）。
 */
export async function runMockSequence(dispatch: (e: AgentEvent) => void): Promise<void> {
  const runId = 'mock-' + Date.now()
  const t1 = 'task-1'
  const t2 = 'task-2'

  dispatch({ type: 'run_started', runId, userQuery: '分析各营业厅业务表现并出一份报告（演示）' })
  await sleep(400)
  dispatch({ type: 'leader_thinking', runId })
  await sleep(900)

  for (const ch of '好的，我安排数据马先分析，再让报表马出报告。') {
    dispatch({ type: 'leader_say', runId, text: ch })
    await sleep(35)
  }

  const brief1 = logSummary('分析各营业厅宽带与套餐办理量、投诉率趋势，输出 TOP 营业厅排名与异常波动说明')
  dispatch({
    type: 'task_dispatched',
    runId,
    taskId: t1,
    from: 'leader',
    to: 'data',
    brief: brief1.summary,
    briefDetail: brief1.detail
  })
  await sleep(4200)

  const sqlFail =
    'SELECT "营业厅", SUM("宽带新装") AS total, AVG("投诉率") AS rate FROM data_demo WHERE "月份" >= \'2025-01\' GROUP BY "营业厅" ORDER BY total DESC'
  const sqlFailLog = logSummary(sqlFail)
  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: t1,
    pony: 'data',
    tool: 'sql_query',
    argsSummary: sqlFailLog.summary,
    argsDetail: sqlFailLog.detail
  })
  await sleep(2000)
  dispatch({
    type: 'tool_call_finished',
    runId,
    taskId: t1,
    pony: 'data',
    tool: 'sql_query',
    ok: false,
    resultSummary: 'no such column: 宽带新装量',
    durationMs: 12
  })
  await sleep(1800)

  const sqlOk =
    'SELECT "营业厅", SUM("宽带新装(户)") AS "新装量", SUM("套餐办理(笔)") AS "套餐量", AVG("投诉率") AS "投诉率" FROM data_demo WHERE "月份" >= \'2025-01\' GROUP BY "营业厅" ORDER BY "新装量" DESC'
  const sqlOkLog = logSummary(sqlOk)
  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: t1,
    pony: 'data',
    tool: 'sql_query',
    argsSummary: sqlOkLog.summary,
    argsDetail: sqlOkLog.detail
  })
  await sleep(1600)
  dispatch({
    type: 'tool_call_finished',
    runId,
    taskId: t1,
    pony: 'data',
    tool: 'sql_query',
    ok: true,
    resultSummary: '返回 6 行',
    durationMs: 8
  })
  await sleep(800)
  dispatch({
    type: 'task_completed',
    runId,
    taskId: t1,
    pony: 'data',
    summary: '城东厅办理量第一，城西厅投诉率连续 3 月上升'
  })
  await sleep(2600)

  dispatch({
    type: 'task_dispatched',
    runId,
    taskId: t2,
    from: 'leader',
    to: 'report',
    brief: '根据分析结论制作业务表现报告'
  })
  await sleep(4200)
  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: t2,
    pony: 'report',
    tool: 'render_report',
    argsSummary: '《营业厅业务表现分析》'
  })
  await sleep(2400)
  dispatch({
    type: 'tool_call_finished',
    runId,
    taskId: t2,
    pony: 'report',
    tool: 'render_report',
    ok: true,
    resultSummary: '报告已生成',
    durationMs: 5
  })
  dispatch({ type: 'report_ready', runId, reportId: 'mock-report', title: '营业厅业务表现分析（演示）' })
  await sleep(600)
  dispatch({ type: 'task_completed', runId, taskId: t2, pony: 'report', summary: '报告含 2 个图表与结论' })
  await sleep(2200)

  for (const ch of '报告已经钉在白板上了，点击白板即可查看。') {
    dispatch({ type: 'leader_say', runId, text: ch })
    await sleep(35)
  }
  dispatch({ type: 'run_finished', runId, ok: true, finalText: '报告已经钉在白板上了，点击白板即可查看。' })
}
