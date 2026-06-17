import { useEffect, useState } from 'react'
import type { AppNotification } from '@shared/types'
import { MarkdownBody } from '@/ui/MarkdownBody'

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function NotificationsDrawerContent({ refreshToken = 0 }: { refreshToken?: number }): React.JSX.Element {
  const [items, setItems] = useState<AppNotification[]>([])

  useEffect(() => {
    if (refreshToken > 0) {
      setItems((prev) => (prev.length > 0 ? prev.map((n) => ({ ...n, read: true })) : prev))
    }
    void window.api.listNotifications().then(setItems)
  }, [refreshToken])

  if (items.length === 0) {
    return (
      <div className="drawer-stack">
        <p className="automation-empty">暂无通知。自动化任务执行完成后会出现在这里。</p>
      </div>
    )
  }

  return (
    <div className="drawer-stack">
      {items.map((n) => (
        <article key={n.id} className={`drawer-notification ${n.tone === 'ok' ? 'ok' : n.tone === 'warn' ? 'warn' : ''}${n.read ? ' read' : ''}`}>
          <i />
          <div>
            <strong>{n.title}</strong>
            <MarkdownBody className="drawer-notification-body">{n.body}</MarkdownBody>
            <span>{formatTime(n.createdAt)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}
