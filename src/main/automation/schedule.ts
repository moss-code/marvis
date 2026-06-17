import type { AutomationSchedule } from '../../shared/types'

const TZ = 'Asia/Shanghai'

function partsInTz(date: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short'
  })
  const parts = fmt.formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0'
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: wdMap[get('weekday')] ?? 0
  }
}

function utcFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  for (let i = 0; i < 3; i++) {
    const p = partsInTz(new Date(guess), timeZone)
    const target = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0)
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0)
    guess += desired - target
  }
  return guess
}

export function computeNextRunAt(schedule: AutomationSchedule, fromMs = Date.now()): number | undefined {
  const tz = schedule.timezone || TZ
  const now = fromMs + 1000

  if (schedule.validUntil && now > schedule.validUntil) return undefined
  const notBefore = schedule.validFrom && schedule.validFrom > now ? schedule.validFrom : now

  if (schedule.kind === 'once') {
    const runAt = schedule.runAt
    if (!runAt || runAt < notBefore) return undefined
    if (schedule.validUntil && runAt > schedule.validUntil) return undefined
    return runAt
  }

  if (schedule.kind === 'interval') {
    const mins = schedule.intervalMinutes ?? 60
    if (mins < 1) return undefined
    return notBefore + mins * 60_000
  }

  const hour = schedule.hour ?? 9
  const minute = schedule.minute ?? 0
  const unit = schedule.periodicUnit ?? 'daily'
  const p = partsInTz(new Date(notBefore), tz)

  if (unit === 'daily') {
    let candidate = utcFromLocal(p.year, p.month, p.day, hour, minute, tz)
    if (candidate < notBefore) {
      candidate = utcFromLocal(p.year, p.month, p.day + 1, hour, minute, tz)
    }
    return schedule.validUntil && candidate > schedule.validUntil ? undefined : candidate
  }

  if (unit === 'weekly') {
    const targetWd = schedule.weekday ?? 1
    let daysAhead = (targetWd - p.weekday + 7) % 7
    let candidate = utcFromLocal(p.year, p.month, p.day + daysAhead, hour, minute, tz)
    if (candidate < notBefore) {
      candidate = utcFromLocal(p.year, p.month, p.day + daysAhead + 7, hour, minute, tz)
    }
    return schedule.validUntil && candidate > schedule.validUntil ? undefined : candidate
  }

  const dom = schedule.dayOfMonth ?? 1
  let candidate = utcFromLocal(p.year, p.month, dom, hour, minute, tz)
  if (candidate < notBefore) {
    candidate = utcFromLocal(p.year, p.month + 1, dom, hour, minute, tz)
  }
  return schedule.validUntil && candidate > schedule.validUntil ? undefined : candidate
}

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

export function formatCountdown(nextRunAt?: number): string {
  if (!nextRunAt) return '未安排'
  const diff = nextRunAt - Date.now()
  if (diff <= 0) return '即将开始'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} 分钟后`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} 小时后`
  const days = Math.floor(hours / 24)
  return `${days} 天后`
}
