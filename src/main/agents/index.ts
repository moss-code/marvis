import { generateText, streamText, stepCountIs, tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { AgentEvent, ChatMessage, Pony, PonyId, TableSchema } from '../../shared/types'
import { getModel } from '../llm'
import { guardSelect } from './sqlGuard'
import { dataSystem, genericSystem, leaderSystem, reportSystem, writerSystem } from './prompts'
import {
  listChatMessages,
  listDataTables,
  listPonies,
  runSelect,
  saveChatMessage,
  saveReport,
  saveRun
} from '../db'
import { buildReportHtml } from '../reports'

export type Emitter = (e: AgentEvent) => void

const MAX_SQL_RETRIES = 2

const SUMMARY_MAX = 200

function truncate(s: string, n = SUMMARY_MAX): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/** 一轮任务：领队马 tool-calling 循环，dispatch 即派单 */
export async function startRun(runId: string, userText: string, emit: Emitter): Promise<void> {
  const events: AgentEvent[] = []
  const record: Emitter = (e) => {
    events.push(e)
    emit(e)
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    content: userText,
    createdAt: Date.now()
  }
  saveChatMessage(userMsg)

  const ponies = listPonies()
  const tables = listDataTables()
  const history = listChatMessages()
    .slice(-20)
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content
    }))

  record({ type: 'run_started', runId, userQuery: userText })
  record({ type: 'leader_thinking', runId })

  let finalText = ''
  try {
    const result = streamText({
      model: getModel(),
      system: leaderSystem(ponies, tables),
      messages: history,
      tools: {
        dispatch: tool({
          description:
            '把一个子任务派发给一只小马并等待其结果摘要。to 为小马 id（data=数据马 / report=报表马 / writer=文书马），brief 为任务说明。',
          inputSchema: z.object({
            to: z.string().describe('目标小马 id：data | report | writer'),
            brief: z.string().describe('子任务说明；派给 report 时必须附带完整分析数据')
          }),
          execute: async ({ to, brief }) => runPonyTask(runId, to, brief, ponies, tables, record)
        })
      },
      stopWhen: stepCountIs(8)
    })

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        finalText += part.text
        record({ type: 'leader_say', runId, text: part.text })
      } else if (part.type === 'error') {
        throw part.error instanceof Error ? part.error : new Error(String(part.error))
      }
    }

    saveChatMessage({
      id: randomUUID(),
      role: 'leader',
      content: finalText || '（本轮没有文字汇报）',
      createdAt: Date.now()
    })
    record({ type: 'run_finished', runId, ok: true, finalText })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const text = finalText || `抱歉，这一轮出了问题：${msg}`
    saveChatMessage({ id: randomUUID(), role: 'leader', content: text, createdAt: Date.now() })
    record({ type: 'run_finished', runId, ok: false, finalText: `出错了：${msg}` })
  } finally {
    saveRun(runId, JSON.stringify(events))
  }
}

/** 子马执行器：独立 tool-calling 循环，返回结果摘要给领队马 */
async function runPonyTask(
  runId: string,
  to: string,
  brief: string,
  ponies: Pony[],
  tables: TableSchema[],
  emit: Emitter
): Promise<string> {
  if (to === 'leader' || to === 'file') {
    return to === 'file'
      ? '派单失败：文件马的能力暂未开通，不能派单给它'
      : '派单失败：不能派单给领队马自己'
  }
  const pony = ponies.find((p) => p.id === to)
  if (!pony) return `派单失败：不存在 id 为 ${to} 的小马`

  const taskId = randomUUID()
  emit({
    type: 'task_dispatched',
    runId,
    taskId,
    from: 'leader',
    to: pony.id,
    brief: truncate(brief)
  })

  try {
    const { system, tools } = buildPonyAgent(pony, tables, { runId, taskId, emit })
    const res = await generateText({
      model: getModel(),
      system,
      prompt: brief,
      tools: tools as ToolSet,
      stopWhen: stepCountIs(6)
    })
    const summary = res.text || '（任务完成，但小马没有附文字说明）'
    emit({ type: 'task_completed', runId, taskId, pony: pony.id, summary: truncate(summary) })
    return summary
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    emit({
      type: 'task_failed',
      runId,
      taskId,
      pony: pony.id,
      reason: truncate(reason),
      retriesUsed: reason.includes('重试') ? MAX_SQL_RETRIES : 0
    })
    return `任务失败：${reason}。请如实告知用户，不要编造结果。`
  }
}

interface TaskCtx {
  runId: string
  taskId: string
  emit: Emitter
}

function buildPonyAgent(pony: Pony, tables: TableSchema[], ctx: TaskCtx) {
  switch (pony.id) {
    case 'data':
      return { system: dataSystem(tables), tools: { sql_query: sqlQueryTool(ctx) } }
    case 'report':
      return { system: reportSystem(), tools: { render_report: renderReportTool(ctx) } }
    case 'writer':
      return { system: writerSystem(), tools: {} }
    default:
      return { system: genericSystem(pony), tools: {} }
  }
}

/** 数据马专属：只读 SQL，报错回喂自动重试 ≤2 次，耗尽即任务失败 */
function sqlQueryTool(ctx: TaskCtx) {
  let failures = 0
  return tool({
    description: '对 SQLite 数据库执行只读 SELECT 查询，返回结果行。表名列名含中文时用双引号。',
    inputSchema: z.object({ sql: z.string().describe('单条 SELECT 或 WITH...SELECT 查询') }),
    execute: async ({ sql }) => {
      const started = Date.now()
      ctx.emit({
        type: 'tool_call_started',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: 'data',
        tool: 'sql_query',
        argsSummary: truncate(sql)
      })
      try {
        const safeSql = guardSelect(sql)
        const { rows, rowCount } = runSelect(safeSql)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: 'data',
          tool: 'sql_query',
          ok: true,
          resultSummary: `返回 ${rowCount} 行`,
          durationMs: Date.now() - started
        })
        // 限制回喂模型的数据量
        return { rowCount, rows: rows.slice(0, 100) }
      } catch (err) {
        failures++
        const msg = err instanceof Error ? err.message : String(err)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: 'data',
          tool: 'sql_query',
          ok: false,
          resultSummary: truncate(msg),
          durationMs: Date.now() - started
        })
        if (failures > MAX_SQL_RETRIES) {
          throw new Error(`SQL 重试 ${MAX_SQL_RETRIES} 次后仍然失败，最后错误：${msg}`)
        }
        return { error: msg, hint: '请根据错误修正 SQL 后重试' }
      }
    }
  })
}

/** 报表马专属：存库并通知白板 */
function renderReportTool(ctx: TaskCtx) {
  return tool({
    description: '生成 HTML 报告并发布到办公室白板。html 只写正文内容，图表用全局 echarts 对象。',
    inputSchema: z.object({
      title: z.string().describe('报告标题'),
      html: z.string().describe('报告正文 HTML（不含 html/head/body 标签）')
    }),
    execute: async ({ title, html }) => {
      const started = Date.now()
      ctx.emit({
        type: 'tool_call_started',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: 'report',
        tool: 'render_report',
        argsSummary: `《${truncate(title, 80)}》正文 ${html.length} 字符`
      })
      const reportId = randomUUID()
      saveReport(reportId, title, buildReportHtml(title, html))
      ctx.emit({
        type: 'tool_call_finished',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: 'report',
        tool: 'render_report',
        ok: true,
        resultSummary: `报告已生成（id: ${reportId.slice(0, 8)}）`,
        durationMs: Date.now() - started
      })
      ctx.emit({ type: 'report_ready', runId: ctx.runId, reportId, title })
      return { reportId, message: '报告已生成并钉在白板上' }
    }
  })
}

export type PonyRoster = { id: PonyId; name: string }[]
