import type { AgentEvent } from '@shared/types'
import { logSummary } from '@shared/logSummary'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * P0 验收用：mock AgentEvent 序列，验证审批暂停、点头、成果传递与电信 ambient。
 * 仅 DEV 通过 window.__mockRun() 触发。
 */
export async function runMockSequence(dispatch: (e: AgentEvent) => void): Promise<void> {
  const runId = 'mock-' + Date.now()
  const tData = 'task-data'
  const tFile = 'task-file'
  const tReport = 'task-report'

  dispatch({
    type: 'run_started',
    runId,
    userQuery: '分析各营业厅宽带办理量，找出 TOP3，并出报告（P0 演示）'
  })
  await sleep(400)
  dispatch({ type: 'leader_thinking', runId })
  await sleep(900)

  const briefData = logSummary(
    '分析各营业厅宽带与套餐办理量、投诉率趋势，输出 TOP3 营业厅排名'
  )
  dispatch({
    type: 'task_dispatched',
    runId,
    taskId: tData,
    from: 'leader',
    to: 'data',
    brief: briefData.summary,
    briefDetail: briefData.detail
  })
  await sleep(4200)

  const sqlLog = logSummary(
    'SELECT "营业厅", SUM("宽带新装(户)") AS total FROM data_demo GROUP BY "营业厅" ORDER BY total DESC LIMIT 3'
  )
  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: tData,
    pony: 'data',
    tool: 'sql_query',
    argsSummary: sqlLog.summary,
    argsDetail: sqlLog.detail
  })
  await sleep(1600)
  dispatch({
    type: 'tool_call_finished',
    runId,
    taskId: tData,
    pony: 'data',
    tool: 'sql_query',
    ok: true,
    resultSummary: '返回 TOP3 行',
    durationMs: 8
  })
  await sleep(900)
  dispatch({
    type: 'task_completed',
    runId,
    taskId: tData,
    pony: 'data',
    summary: '城东厅、中心厅、高新厅办理量位列前三'
  })
  await sleep(2800)

  const briefFile = logSummary('归档分析中间结果到工作区 reports/ 目录')
  dispatch({
    type: 'task_dispatched',
    runId,
    taskId: tFile,
    from: 'leader',
    to: 'file',
    brief: briefFile.summary,
    briefDetail: briefFile.detail
  })
  await sleep(4200)

  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: tFile,
    pony: 'file',
    tool: 'write_file',
    argsSummary: '写入 reports/data-top3.json'
  })
  await sleep(800)
  dispatch({
    type: 'approval_required',
    runId,
    taskId: tFile,
    pony: 'file',
    approvalId: 'mock-approval-' + Date.now(),
    tool: 'write_file',
    riskLevel: 'medium',
    resource: 'reports/data-top3.json',
    reason: '写入工作区文件需用户确认'
  })
  await sleep(3200)

  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: tFile,
    pony: 'file',
    tool: 'write_file',
    argsSummary: '写入 reports/data-top3.json（已批准）'
  })
  await sleep(1400)
  dispatch({
    type: 'tool_call_finished',
    runId,
    taskId: tFile,
    pony: 'file',
    tool: 'write_file',
    ok: true,
    resultSummary: '已写入 1 个文件',
    durationMs: 6
  })
  await sleep(900)
  dispatch({
    type: 'task_completed',
    runId,
    taskId: tFile,
    pony: 'file',
    summary: '分析结果已归档'
  })
  await sleep(2600)

  dispatch({
    type: 'task_dispatched',
    runId,
    taskId: tReport,
    from: 'leader',
    to: 'report',
    brief: '根据 TOP3 结论制作宽带办理量报告'
  })
  await sleep(4200)
  dispatch({
    type: 'tool_call_started',
    runId,
    taskId: tReport,
    pony: 'report',
    tool: 'render_report',
    argsSummary: '《营业厅宽带办理量 TOP3》'
  })
  await sleep(2400)
  dispatch({
    type: 'tool_call_finished',
    runId,
    taskId: tReport,
    pony: 'report',
    tool: 'render_report',
    ok: true,
    resultSummary: '报告已生成',
    durationMs: 5
  })
  dispatch({
    type: 'report_ready',
    runId,
    reportId: 'mock-report',
    title: '营业厅宽带办理量 TOP3（演示）'
  })
  await sleep(600)
  dispatch({
    type: 'task_completed',
    runId,
    taskId: tReport,
    pony: 'report',
    summary: '报告含柱状图与 TOP3 结论'
  })
  await sleep(2200)

  dispatch({
    type: 'run_finished',
    runId,
    ok: true,
    finalText: 'TOP3 报告已钉在白板，点击白板即可查看。'
  })
}
