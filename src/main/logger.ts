import type { AgentEvent } from '../shared/types'

const MAX_FIELD = 200

function clip(s: string, n = MAX_FIELD): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}

export function logInfo(tag: string, message: string, extra?: Record<string, unknown>): void {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : ''
  console.log(`[${ts()}] [${tag}] ${message}${suffix}`)
}

export function logWarn(tag: string, message: string, extra?: Record<string, unknown>): void {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : ''
  console.warn(`[${ts()}] [${tag}] ${message}${suffix}`)
}

export function logError(tag: string, message: string, err?: unknown): void {
  if (err instanceof Error) {
    console.error(`[${ts()}] [${tag}] ${message}`, err.message, err.stack ?? '')
    return
  }
  if (err !== undefined) {
    console.error(`[${ts()}] [${tag}] ${message}`, err)
    return
  }
  console.error(`[${ts()}] [${tag}] ${message}`)
}

/** 将 AgentEvent 格式化为单行（leader_say 流式增量不打印，避免刷屏） */
export function formatAgentEvent(ev: AgentEvent): string | null {
  switch (ev.type) {
    case 'leader_say':
      return null
    case 'run_started':
      return `run_started id=${ev.runId} query="${clip(ev.userQuery)}"`
    case 'leader_thinking':
      return `leader_thinking id=${ev.runId}`
    case 'task_dispatched':
      return `dispatch id=${ev.runId} task=${ev.taskId} to=${ev.to} brief="${clip(ev.brief)}"`
    case 'tool_call_started':
      return `tool_start id=${ev.runId} task=${ev.taskId} pony=${ev.pony} tool=${ev.tool} args="${clip(ev.argsSummary)}"`
    case 'tool_call_finished':
      return `tool_end id=${ev.runId} task=${ev.taskId} pony=${ev.pony} tool=${ev.tool} ok=${ev.ok} ${ev.durationMs}ms result="${clip(ev.resultSummary)}"`
    case 'task_completed':
      return `task_ok id=${ev.runId} task=${ev.taskId} pony=${ev.pony} summary="${clip(ev.summary)}"`
    case 'task_failed':
      return `task_fail id=${ev.runId} task=${ev.taskId} pony=${ev.pony} retries=${ev.retriesUsed} reason="${clip(ev.reason)}"`
    case 'report_ready':
      return `report_ready id=${ev.runId} reportId=${ev.reportId} title="${clip(ev.title)}"`
    case 'run_finished':
      return `run_finished id=${ev.runId} ok=${ev.ok} final="${clip(ev.finalText, 300)}"`
    default:
      return null
  }
}

export function logAgentEvent(ev: AgentEvent): void {
  const line = formatAgentEvent(ev)
  if (line) console.log(`[${ts()}] [agent] ${line}`)
}
