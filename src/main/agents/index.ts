import { generateText, streamText, stepCountIs, tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentEvent, ChatMessage, Pony, PonyId, TableSchema } from '../../shared/types'
import { logSummary } from '../../shared/logSummary'
import { getModel } from '../llm'
import { guardSelect } from './sqlGuard'
import {
  describeRoster,
  dispatchToolDescription,
  leaderSystem,
  ponyBaseSystem,
  shouldRequireDispatch
} from './prompts'
import {
  getReport,
  listChatMessages,
  resolveActiveTables,
  listMcpServers,
  listPonies,
  listReports,
  listSkills,
  runSelect,
  saveChatMessage,
  saveReport,
  saveRun
} from '../db'
import { buildReportHtml } from '../reports'
import { getMcpToolsFor } from '../mcp'
import { logError, logInfo, logWarn } from '../logger'
import { getSkillScriptTools } from '../skills/scriptTools'
import { getSkillReferenceTools } from '../skills/referenceTools'
import { getWorkspaceDir } from '../workspace'
import { isAbortError } from '../abortError'

export type Emitter = (e: AgentEvent) => void

const MAX_SQL_RETRIES = 2

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'report'
}

/** 在本轮用户消息前注入实时花名册，避免对话历史中的旧编制误导派单 */
function withRosterSnapshot(
  history: { role: 'user' | 'assistant'; content: string }[],
  userText: string
): { role: 'user' | 'assistant'; content: string }[] {
  const snapshot = describeRoster(listPonies(), listSkills(), listMcpServers())
  const msgs = [...history]
  const last = msgs[msgs.length - 1]
  if (last?.role === 'user' && last.content === userText) {
    msgs[msgs.length - 1] = { role: 'user', content: `${snapshot}\n\n${userText}` }
  } else {
    msgs.push({ role: 'user', content: `${snapshot}\n\n${userText}` })
  }
  return msgs
}

function formatAvailablePonies(ponies: Pony[]): string {
  return ponies
    .filter((p) => p.id !== 'leader')
    .map((p) => `${p.id}（${p.name}）`)
    .join('、')
}

/** 解析派单目标：优先 id，兼容领队马误填小马名字的情况 */
function resolvePonyTarget(to: string, ponies: Pony[]): Pony | undefined {
  const t = to.trim()
  if (!t || t === 'leader') return undefined
  const workers = ponies.filter((p) => p.id !== 'leader')
  const byId = workers.find((p) => p.id === t)
  if (byId) return byId
  const byName = workers.find((p) => p.name === t)
  if (byName) return byName
  const short = t.replace(/马$/, '')
  return workers.find(
    (p) =>
      p.name.replace(/马$/, '') === short ||
      p.name.includes(t) ||
      t.includes(p.name.replace(/马$/, ''))
  )
}

/** 一轮任务：领队马 tool-calling 循环，dispatch 即派单 */
export async function startRun(
  runId: string,
  userText: string,
  emit: Emitter,
  signal?: AbortSignal,
  mode: 'chat' | 'task' = 'task'
): Promise<void> {
  const events: AgentEvent[] = []
  const runStartedAt = Date.now()
  let finished = false

  const record: Emitter = (e) => {
    events.push(e)
    emit(e)
  }

  const finishRun = (ok: boolean, finalText: string): void => {
    if (finished) return
    finished = true
    record({ type: 'run_finished', runId, ok, finalText })
  }

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    content: userText,
    createdAt: Date.now()
  }
  saveChatMessage(userMsg)

  const tables = resolveActiveTables()
  const history = listChatMessages()
    .slice(-20)
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content
    }))
  const messages = withRosterSnapshot(history, userText)

  record({ type: 'run_started', runId, userQuery: userText })
  record({ type: 'leader_thinking', runId })

  let finalText = ''
  try {
    let leaderMessages = messages
    let runOk = true

    for (let attempt = 0; attempt < 2; attempt++) {
      finalText = ''
      const ponies = listPonies()
      const reports = listReports()
      const skills = listSkills()
      const mcpServers = listMcpServers()
      const result = streamText({
        model: getModel(),
        system: `${leaderSystem(ponies, tables, reports, skills, mcpServers)}\n\n${
          mode === 'chat'
            ? '## 本轮模式：直接咨询\n请以主 Agent 身份直接回答用户，不要调用 dispatch，不要把问题派给小马。若用户实际要求执行任务，提醒其使用首页的「发布任务」。'
            : '## 本轮模式：任务执行\n本轮必须调用 dispatch，把工作交给合适的小马执行。'
        }`,
        messages: leaderMessages,
        abortSignal: signal,
        tools: {
          dispatch: tool({
            description: dispatchToolDescription(ponies),
            inputSchema: z.object({
              to: z
                .string()
                .describe(
                  '目标小马 id（花名册第一列，如 custom-abc12345 或 data）；优先填 id，也接受小马名字'
                ),
              brief: z.string().describe('子任务说明；派给 report 时必须附带完整分析数据')
            }),
            execute: async ({ to, brief }) =>
              runPonyTask(runId, to, brief, tables, record, signal)
          })
        },
        stopWhen: stepCountIs(8),
        prepareStep: ({ steps }) => {
          const hasDispatched = steps.some((step) =>
            step.toolCalls.some((tc) => tc.toolName === 'dispatch')
          )
          if (mode === 'chat') return { toolChoice: 'none' }
          if (shouldRequireDispatch(userText) && !hasDispatched) {
            logInfo('leader', '强制要求 dispatch', { runId, attempt, step: steps.length })
            return { toolChoice: 'required', activeTools: ['dispatch'] }
          }
          return undefined
        }
      })

      for await (const part of result.fullStream) {
        if (signal?.aborted) {
          throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
        }
        if (part.type === 'text-delta') {
          finalText += part.text
          record({ type: 'leader_say', runId, text: part.text })
        } else if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error))
        }
      }

      const dispatched = events.some((e) => e.type === 'task_dispatched' && e.runId === runId)
      if (mode === 'chat' || !shouldRequireDispatch(userText) || dispatched) break

      if (attempt === 0) {
        logWarn('leader', '本轮无派单记录，触发督办重试', { runId, preview: finalText.slice(0, 120) })
        leaderMessages = [
          ...leaderMessages,
          { role: 'assistant', content: finalText || '（未调用 dispatch）' },
          {
            role: 'user',
            content:
              '【系统督办】任务日志显示你本轮没有 dispatch 派单，却向老板汇报了结果。请立即调用 dispatch 派给合适的小马，只能根据工具返回汇报，禁止虚构。'
          }
        ]
        finalText = ''
        runOk = false
      }
    }

    const dispatched = events.some((e) => e.type === 'task_dispatched' && e.runId === runId)
    if (mode === 'task' && shouldRequireDispatch(userText) && !dispatched) {
      logWarn('leader', '督办重试后仍无派单，拒绝空想结果', { runId })
      finalText =
        '抱歉，本轮未能实际派出小马执行任务（任务日志中无派单记录），因此无法提供真实结果。请再说一次您的需求，我会重新派单。'
      runOk = false
    }

    saveChatMessage({
      id: randomUUID(),
      role: 'leader',
      content: finalText || '（本轮没有文字汇报）',
      createdAt: Date.now()
    })
    finishRun(runOk, finalText || '（本轮没有文字汇报）')
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      logInfo('leader', '用户取消任务', { runId })
      saveChatMessage({
        id: randomUUID(),
        role: 'leader',
        content: '本轮任务已被您取消',
        createdAt: Date.now()
      })
      finishRun(false, '本轮任务已被您取消')
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      logError('leader', `本轮任务异常 runId=${runId}`, err)
      const text = finalText || `抱歉，这一轮出了问题：${msg}`
      saveChatMessage({ id: randomUUID(), role: 'leader', content: text, createdAt: Date.now() })
      finishRun(false, `出错了：${msg}`)
    }
  } finally {
    const finishedEv = events.find((e) => e.type === 'run_finished')
    const startedEv = events.find((e) => e.type === 'run_started')
    saveRun(runId, JSON.stringify(events), {
      userQuery: startedEv?.type === 'run_started' ? startedEv.userQuery : userText,
      ok: finishedEv?.type === 'run_finished' ? finishedEv.ok : false,
      durationMs: Date.now() - runStartedAt,
      eventCount: events.length,
      startedAt: runStartedAt
    })
  }
}

/** 子马执行器：独立 tool-calling 循环，返回结果摘要给领队马 */
async function runPonyTask(
  runId: string,
  to: string,
  brief: string,
  tables: TableSchema[],
  emit: Emitter,
  signal?: AbortSignal
): Promise<string> {
  const ponies = listPonies()
  const reports = listReports()
  const skills = listSkills()

  if (to === 'leader') {
    return '派单失败：不能派单给领队马自己'
  }
  const pony = resolvePonyTarget(to, ponies)
  if (!pony) {
    logWarn('dispatch', '派单目标不存在', { runId, to, roster: formatAvailablePonies(ponies) })
    return `派单失败：「${to}」不在当前花名册（可能已离职或名称写错）。当前可派：${formatAvailablePonies(ponies)}。请用花名册中的 id 重试或如实告知用户。`
  }

  const taskId = randomUUID()

  logInfo('dispatch', '派单给小马', {
    runId,
    taskId,
    pony: pony.id,
    name: pony.name,
    skills: pony.skills,
    mcpServers: pony.mcpServers,
    brief: brief.slice(0, 120)
  })
  const briefLog = logSummary(brief)
  emit({
    type: 'task_dispatched',
    runId,
    taskId,
    from: 'leader',
    to: pony.id,
    brief: briefLog.summary,
    briefDetail: briefLog.detail
  })

  const ctx: TaskCtx = { runId, taskId, pony: pony.id, emit, signal }

  try {
    const { system, tools } = await buildPonyAgent(pony, tables, reports, skills, ctx)
    const res = await generateText({
      model: getModel(),
      system,
      prompt: brief,
      tools: tools as ToolSet,
      abortSignal: signal,
      stopWhen: stepCountIs(6)
    })
    const summary = res.text || '（任务完成，但小马没有附文字说明）'
    const summaryLog = logSummary(summary)
    emit({
      type: 'task_completed',
      runId,
      taskId,
      pony: pony.id,
      summary: summaryLog.summary,
      summaryDetail: summaryLog.detail
    })
    return summary
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) {
      emit({
        type: 'task_failed',
        runId,
        taskId,
        pony: pony.id,
        reason: '用户取消了本轮任务',
        retriesUsed: 0
      })
      return '任务已被用户取消'
    }
    const reason = err instanceof Error ? err.message : String(err)
    const reasonLog = logSummary(reason)
    emit({
      type: 'task_failed',
      runId,
      taskId,
      pony: pony.id,
      reason: reasonLog.summary,
      reasonDetail: reasonLog.detail,
      retriesUsed: reason.includes('重试') ? MAX_SQL_RETRIES : 0
    })
    return `任务失败：${reason}。请如实告知用户，不要编造结果。`
  }
}

interface TaskCtx {
  runId: string
  taskId: string
  pony: PonyId
  emit: Emitter
  signal?: AbortSignal
}

async function buildPonyAgent(
  pony: Pony,
  tables: TableSchema[],
  reports: ReturnType<typeof listReports>,
  skills: ReturnType<typeof listSkills>,
  ctx: TaskCtx
): Promise<{ system: string; tools: ToolSet }> {
  const system = ponyBaseSystem(pony, tables, reports, skills)
  const tools: ToolSet = {}

  logInfo('pony', '子马就绪', {
    runId: ctx.runId,
    taskId: ctx.taskId,
    pony: pony.id,
    name: pony.name,
    skills: pony.skills,
    mcpServers: pony.mcpServers
  })

  if (pony.id === 'data') {
    tools.sql_query = sqlQueryTool(ctx)
  } else if (pony.id === 'report') {
    tools.render_report = renderReportTool(ctx)
  } else   if (pony.id === 'file') {
    tools.export_report_file = exportReportFileTool(ctx)
  }

  if (pony.mcpServers.length > 0) {
    const mcpTools = await getMcpToolsFor(pony.mcpServers, ctx)
    Object.assign(tools, mcpTools)
  }

  Object.assign(tools, getSkillScriptTools(pony.skills, skills, ctx))
  Object.assign(tools, getSkillReferenceTools(pony.skills, skills, ctx))

  return { system, tools }
}

/** 数据马专属：只读 SQL，报错回喂自动重试 ≤2 次，耗尽即任务失败 */
function sqlQueryTool(ctx: TaskCtx) {
  let failures = 0
  return tool({
    description: '对 SQLite 数据库执行只读 SELECT 查询，返回结果行。表名列名含中文时用双引号。',
    inputSchema: z.object({ sql: z.string().describe('单条 SELECT 或 WITH...SELECT 查询') }),
    execute: async ({ sql }) => {
      const started = Date.now()
      const argsLog = logSummary(sql)
      ctx.emit({
        type: 'tool_call_started',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: ctx.pony,
        tool: 'sql_query',
        argsSummary: argsLog.summary,
        argsDetail: argsLog.detail
      })
      try {
        const safeSql = guardSelect(sql)
        const { rows, rowCount } = runSelect(safeSql)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'sql_query',
          ok: true,
          resultSummary: `返回 ${rowCount} 行`,
          durationMs: Date.now() - started
        })
        return { rowCount, rows: rows.slice(0, 100) }
      } catch (err) {
        failures++
        const msg = err instanceof Error ? err.message : String(err)
        const resultLog = logSummary(msg)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'sql_query',
          ok: false,
          resultSummary: resultLog.summary,
          resultDetail: resultLog.detail,
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
      const titleLog = logSummary(title, 80)
      const argsSummary = `《${titleLog.summary}》正文 ${html.length} 字符`
      const argsDetail = titleLog.detail
        ? `《${title}》正文 ${html.length} 字符`
        : undefined
      ctx.emit({
        type: 'tool_call_started',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: ctx.pony,
        tool: 'render_report',
        argsSummary,
        argsDetail
      })
      const reportId = randomUUID()
      saveReport(reportId, title, buildReportHtml(title, html))
      ctx.emit({
        type: 'tool_call_finished',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: ctx.pony,
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

/** 文件马专属：主进程直写报告 HTML 到工作区 */
function exportReportFileTool(ctx: TaskCtx) {
  return tool({
    description: '把已生成的报告 HTML 归档到办公室工作区目录，返回保存路径。',
    inputSchema: z.object({
      reportId: z.string().describe('报告 id'),
      filename: z.string().optional().describe('可选文件名，默认用报告标题')
    }),
    execute: async ({ reportId, filename }) => {
      const started = Date.now()
      const exportArgsLog = logSummary(JSON.stringify({ reportId, filename }))
      ctx.emit({
        type: 'tool_call_started',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: ctx.pony,
        tool: 'export_report_file',
        argsSummary: exportArgsLog.summary,
        argsDetail: exportArgsLog.detail
      })

      const report = getReport(reportId)
      if (!report) {
        const msg = `报告 ${reportId} 不存在`
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'export_report_file',
          ok: false,
          resultSummary: msg,
          durationMs: Date.now() - started
        })
        return { error: msg }
      }

      const baseName = sanitizeFilename(filename || `${report.title}.html`)
      const finalName = baseName.endsWith('.html') ? baseName : `${baseName}.html`
      const target = join(getWorkspaceDir(), finalName)

      if (existsSync(target)) {
        const { dialog, BrowserWindow } = await import('electron')
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        if (win) {
          const { response } = await dialog.showMessageBox(win, {
            type: 'warning',
            buttons: ['覆盖', '取消'],
            defaultId: 1,
            cancelId: 1,
            title: '确认覆盖文件',
            message: `文件已存在：${finalName}`,
            detail: '是否覆盖？'
          })
          if (response !== 0) {
            ctx.emit({
              type: 'tool_call_finished',
              runId: ctx.runId,
              taskId: ctx.taskId,
              pony: ctx.pony,
              tool: 'export_report_file',
              ok: false,
              resultSummary: '用户取消',
              durationMs: Date.now() - started
            })
            return { error: '用户取消了覆盖操作' }
          }
        }
      }

      try {
        writeFileSync(target, report.html, 'utf8')
        const savedLog = logSummary(target)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'export_report_file',
          ok: true,
          resultSummary: savedLog.summary,
          resultDetail: savedLog.detail,
          durationMs: Date.now() - started
        })
        return { savedPath: target }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const failLog = logSummary(msg)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'export_report_file',
          ok: false,
          resultSummary: failLog.summary,
          resultDetail: failLog.detail,
          durationMs: Date.now() - started
        })
        return { error: msg }
      }
    }
  })
}

export type PonyRoster = { id: PonyId; name: string }[]
