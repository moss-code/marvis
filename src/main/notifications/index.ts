import { randomUUID } from 'node:crypto'
import { Notification } from 'electron'
import type { AppNotification } from '../../shared/types'
import { saveNotification } from '../db/notifications'
import { getUserPreferences } from '../db/preferences'
import { logInfo } from '../logger'

export interface NotifyInput {
  kind: AppNotification['kind']
  title: string
  body: string
  tone: AppNotification['tone']
  runId?: string
  automationJobId?: string
  forceDesktop?: boolean
}

export function pushNotification(input: NotifyInput): AppNotification {
  const prefs = getUserPreferences()
  let saved: AppNotification | null = null

  if (prefs.inAppNotifications) {
    saved = saveNotification({
      kind: input.kind,
      title: input.title,
      body: input.body,
      tone: input.tone,
      runId: input.runId,
      automationJobId: input.automationJobId
    })
  }

  const desktop = input.forceDesktop ?? prefs.desktopNotifications
  if (desktop && Notification.isSupported()) {
    const n = new Notification({
      title: input.title,
      body: input.body.slice(0, 240)
    })
    n.show()
    logInfo('notify', '桌面通知', { title: input.title })
  }

  return (
    saved ?? {
      id: randomUUID(),
      read: false,
      createdAt: Date.now(),
      ...input
    }
  )
}

export function notifyAutomationResult(
  jobName: string,
  ok: boolean,
  summary: string,
  jobId: string,
  runId: string,
  notify: { inApp: boolean; desktop: boolean; onSuccess: boolean; onFailure: boolean }
): void {
  if (ok && !notify.onSuccess) return
  if (!ok && !notify.onFailure) return

  const prefs = getUserPreferences()
  pushNotification({
    kind: 'automation',
    title: ok ? `「${jobName}」执行成功` : `「${jobName}」执行失败`,
    body: summary.slice(0, 1800) || (ok ? '任务已完成' : '任务执行失败'),
    tone: ok ? 'ok' : 'warn',
    runId,
    automationJobId: jobId,
    forceDesktop: notify.desktop && prefs.desktopNotifications
  })
}
