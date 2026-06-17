import type { AutomationJob, AutomationSchedule } from '@shared/types'

export function formatScheduleLabel(schedule: AutomationSchedule): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const time = `${pad(schedule.hour ?? 9)}:${pad(schedule.minute ?? 0)}`
  if (schedule.kind === 'once') {
    return schedule.runAt ? `单次 · ${new Date(schedule.runAt).toLocaleString('zh-CN')}` : '单次'
  }
  if (schedule.kind === 'interval') {
    const m = schedule.intervalMinutes ?? 60
    if (m >= 1440 && m % 1440 === 0) return `每 ${m / 1440} 天`
    if (m >= 60 && m % 60 === 0) return `每 ${m / 60} 小时`
    return `每 ${m} 分钟`
  }
  const unit = schedule.periodicUnit ?? 'daily'
  if (unit === 'daily') return `每天 · ${time}`
  if (unit === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每周 ${names[schedule.weekday ?? 1]} · ${time}`
  }
  return `每月 ${schedule.dayOfMonth ?? 1} 日 · ${time}`
}

/** 任务卡片底部展示的简短频率文案 */
export function formatScheduleShort(schedule: AutomationSchedule): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const time = `${pad(schedule.hour ?? 9)}:${pad(schedule.minute ?? 0)}`
  if (schedule.kind === 'once') {
    return schedule.runAt
      ? `单次 ${new Date(schedule.runAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : '单次执行'
  }
  if (schedule.kind === 'interval') {
    const m = schedule.intervalMinutes ?? 60
    if (m >= 1440 && m % 1440 === 0) return `每 ${m / 1440} 天`
    if (m >= 60 && m % 60 === 0) return `每 ${m / 60} 小时`
    return `每 ${m} 分钟`
  }
  const unit = schedule.periodicUnit ?? 'daily'
  if (unit === 'daily') return `每天 ${time}`
  if (unit === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每周${names[schedule.weekday ?? 1]} ${time}`
  }
  return `每月 ${schedule.dayOfMonth ?? 1} 日 ${time}`
}

export function runtimeStatusText(job: AutomationJob): string {
  if (!job.enabled) return '已暂停'
  if (job.runtimeStatus === 'running') return '执行中'
  if (job.runtimeStatus === 'waiting') return `排队等待${job.queuePosition ? ` (#${job.queuePosition})` : ''}`
  if (job.lastStatus === 'failed') return '上次失败'
  return '等待执行'
}

export function formatCountdown(nextRunAt?: number): string {
  if (!nextRunAt) return '未安排'
  const diff = nextRunAt - Date.now()
  if (diff <= 0) return '即将开始'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} 分钟后开始`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} 小时后开始`
  const days = Math.floor(hours / 24)
  return `${days} 天后开始`
}

export function statusLabel(job: AutomationJob): string {
  if (!job.enabled) return '已暂停'
  if (job.runtimeStatus === 'running') return '执行中'
  if (job.runtimeStatus === 'waiting') return `等待中${job.queuePosition ? ` (#${job.queuePosition})` : ''}`
  return formatCountdown(job.nextRunAt)
}

const DISPATCH_HINTS = ['派单', '派给', '报表马', '数据马', 'dispatch', '生成报告并', '让小马']

export function detectDispatchPrompt(prompt: string): boolean {
  const text = prompt.toLowerCase()
  return DISPATCH_HINTS.some((h) => text.includes(h.toLowerCase()))
}
