import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { AppNotification } from '../../shared/types'

let dbRef: DatabaseSync

export function bindNotificationsDb(db: DatabaseSync): void {
  dbRef = db
}

export function saveNotification(input: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
  const n: AppNotification = {
    id: randomUUID(),
    read: false,
    createdAt: Date.now(),
    ...input
  }
  dbRef
    .prepare('INSERT INTO notifications (id, json, created_at, read) VALUES (?, ?, ?, 0)')
    .run(n.id, JSON.stringify(n), n.createdAt)
  return n
}

export function listNotifications(limit = 50): AppNotification[] {
  const rows = dbRef
    .prepare('SELECT json, read FROM notifications ORDER BY created_at DESC LIMIT ?')
    .all(limit) as { json: string; read: number }[]
  return rows.map((r) => {
    const n = JSON.parse(r.json) as AppNotification
    n.read = Boolean(r.read)
    return n
  })
}

export function markNotificationRead(id: string): void {
  const row = dbRef.prepare('SELECT json FROM notifications WHERE id = ?').get(id) as
    | { json: string }
    | undefined
  if (!row) return
  const n = JSON.parse(row.json) as AppNotification
  n.read = true
  dbRef.prepare('UPDATE notifications SET json = ?, read = 1 WHERE id = ?').run(JSON.stringify(n), id)
}

export function markAllNotificationsRead(): void {
  const rows = dbRef.prepare('SELECT id, json FROM notifications WHERE read = 0').all() as {
    id: string
    json: string
  }[]
  for (const row of rows) {
    const n = JSON.parse(row.json) as AppNotification
    n.read = true
    dbRef
      .prepare('UPDATE notifications SET json = ?, read = 1 WHERE id = ?')
      .run(JSON.stringify(n), row.id)
  }
}

export function countUnreadNotifications(): number {
  const row = dbRef.prepare('SELECT COUNT(*) AS c FROM notifications WHERE read = 0').get() as {
    c: number
  }
  return row?.c ?? 0
}
