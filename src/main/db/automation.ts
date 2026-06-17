import { randomUUID } from 'node:crypto'
import type {
  AutomationJob,
  AutomationJobDraft,
  AutomationSchedule
} from '../../shared/types'

import type { DatabaseSync } from 'node:sqlite'

let dbRef: DatabaseSync

export function bindAutomationDb(db: DatabaseSync): void {
  dbRef = db
}

export function migrateAutomationTables(): void {
  dbRef.exec(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      next_run_at INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
  `)
  for (const ddl of [
    'ALTER TABLE runs ADD COLUMN trigger TEXT',
    'ALTER TABLE runs ADD COLUMN automation_job_id TEXT'
  ]) {
    try {
      dbRef.exec(ddl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes('duplicate column')) throw err
    }
  }
}

function defaultNotify(): AutomationJob['notify'] {
  return {
    inApp: true,
    desktop: true,
    wechat: false,
    onSuccess: true,
    onFailure: true
  }
}

function defaultSchedule(): AutomationSchedule {
  return {
    kind: 'periodic',
    periodicUnit: 'daily',
    hour: 9,
    minute: 0,
    timezone: 'Asia/Shanghai'
  }
}

export function assertValidAutomationJob(job: AutomationJob): void {
  if (!job.name?.trim()) throw new Error('任务名称不能为空')
  if (!job.prompt?.trim()) throw new Error('提示词不能为空')
  if (job.mode === 'solution' && !job.solutionId) {
    throw new Error('方案任务必须选择解决方案')
  }
}

export function mergeAutomationDraft(
  existing: AutomationJob | null,
  draft: AutomationJobDraft,
  attachments: AutomationJob['attachments']
): AutomationJob {
  const now = Date.now()
  const id = draft.id?.trim() || existing?.id || `automation-${now}-${randomUUID().slice(0, 8)}`
  return {
    id,
    name: draft.name.trim(),
    enabled: draft.enabled ?? existing?.enabled ?? true,
    mode: draft.mode,
    solutionId: draft.mode === 'solution' ? draft.solutionId : undefined,
    prompt: draft.prompt.trim(),
    attachments,
    skillIds: draft.skillIds ?? existing?.skillIds ?? [],
    mcpServerIds: draft.mcpServerIds ?? existing?.mcpServerIds ?? [],
    schedule: draft.schedule ?? existing?.schedule ?? defaultSchedule(),
    ignoreRisk: draft.ignoreRisk ?? existing?.ignoreRisk ?? false,
    notify: { ...defaultNotify(), ...existing?.notify, ...draft.notify },
    onConflict: draft.onConflict ?? existing?.onConflict ?? 'queue',
    lastRunId: existing?.lastRunId,
    lastStatus: existing?.lastStatus,
    nextRunAt: existing?.nextRunAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
}

export function saveAutomationJobRecord(job: AutomationJob): AutomationJob {
  assertValidAutomationJob(job)
  dbRef
    .prepare(
      'INSERT OR REPLACE INTO automation_jobs (id, json, next_run_at, enabled) VALUES (?, ?, ?, ?)'
    )
    .run(job.id, JSON.stringify(job), job.nextRunAt ?? null, job.enabled ? 1 : 0)
  return job
}

export function getAutomationJob(id: string): AutomationJob | null {
  const row = dbRef.prepare('SELECT json FROM automation_jobs WHERE id = ?').get(id) as
    | { json: string }
    | undefined
  if (!row) return null
  return JSON.parse(row.json) as AutomationJob
}

export function listAutomationJobs(): AutomationJob[] {
  const rows = dbRef
    .prepare('SELECT json FROM automation_jobs ORDER BY json')
    .all() as { json: string }[]
  return rows
    .map((r) => JSON.parse(r.json) as AutomationJob)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteAutomationJobRecord(id: string): void {
  dbRef.prepare('DELETE FROM automation_jobs WHERE id = ?').run(id)
}

export function listEnabledAutomationJobs(): AutomationJob[] {
  const rows = dbRef
    .prepare('SELECT json FROM automation_jobs WHERE enabled = 1')
    .all() as { json: string }[]
  return rows.map((r) => JSON.parse(r.json) as AutomationJob)
}
