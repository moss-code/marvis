import type { AgentEvent } from '@shared/types'

export type LogTone = 'normal' | 'strong' | 'dispatch' | 'approval' | 'error' | 'report'

export interface LogLine {
  text: string
  tone: LogTone
  /** 被截断时的完整文案，供任务日志模态点击展开 */
  fullText?: string
}

const TONE_BY_TYPE: Partial<Record<AgentEvent['type'], LogTone>> = {
  run_started: 'strong',
  task_dispatched: 'dispatch',
  approval_required: 'approval',
  task_failed: 'error',
  report_ready: 'report',
  run_finished: 'strong'
}

function withFull(text: string, full?: string): LogLine['fullText'] {
  return full && full !== text ? full : undefined
}

/** 任务日志行文案（TaskLog 模态与场景 LogBoard 共用） */
export function describeEvent(
  ev: AgentEvent,
  ponyName: (id: string) => string
): LogLine | null {
  let text: string | null = null
  let fullText: string | undefined

  switch (ev.type) {
    case 'run_started':
      text = ev.solutionTitle
        ? `【${ev.solutionTitle}】任务开始：${ev.userQuery}`
        : `任务开始：${ev.userQuery}`
      break
    case 'leader_thinking':
      text = '领队马思考中…'
      break
    case 'task_dispatched': {
      const who = `领队马 → ${ponyName(ev.to)}`
      text = `${who}：${ev.brief}`
      fullText = ev.briefDetail ? `${who}：${ev.briefDetail}` : undefined
      break
    }
    case 'tool_call_started': {
      const who = `${ponyName(ev.pony)} 调用 ${ev.tool}`
      text = `${who}：${ev.argsSummary}`
      fullText = ev.argsDetail ? `${who}：${ev.argsDetail}` : undefined
      break
    }
    case 'approval_required':
      text = `${ponyName(ev.pony)} 请求审批 ${ev.tool}（${ev.riskLevel}）：${ev.resource}；${ev.reason}`
      break
    case 'tool_call_finished': {
      const who = `${ponyName(ev.pony)} ${ev.tool} ${ev.ok ? '成功' : '失败'}（${ev.durationMs}ms）`
      text = `${who}：${ev.resultSummary}`
      fullText = ev.resultDetail ? `${who}：${ev.resultDetail}` : undefined
      break
    }
    case 'task_completed': {
      const who = `${ponyName(ev.pony)} 完成任务`
      text = `${who}：${ev.summary}`
      fullText = ev.summaryDetail ? `${who}：${ev.summaryDetail}` : undefined
      break
    }
    case 'task_failed': {
      const who = `${ponyName(ev.pony)} 任务失败（重试 ${ev.retriesUsed} 次）`
      text = `${who}：${ev.reason}`
      fullText = ev.reasonDetail ? `${who}：${ev.reasonDetail}` : undefined
      break
    }
    case 'report_ready':
      text = `报告《${ev.title}》已钉上白板`
      break
    case 'run_finished':
      text = ev.ok ? '本轮任务完成' : `本轮任务异常结束：${ev.finalText}`
      break
    default:
      return null
  }
  if (!text) return null
  return { text, tone: TONE_BY_TYPE[ev.type] ?? 'normal', fullText: withFull(text, fullText) }
}

export const LOG_TONE_CLASS: Record<LogTone, string> = {
  normal: '',
  strong: 'log-strong',
  dispatch: 'log-dispatch',
  approval: 'log-approval',
  error: 'log-error',
  report: 'log-report'
}
