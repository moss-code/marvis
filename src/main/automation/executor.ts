import { randomUUID } from 'node:crypto'
import type { AutomationJob, AutomationJobDraft, AutomationJobRuntimeStatus } from '../../shared/types'
import {
  appendActiveTableNames,
  getActiveTableNames,
  getSolution,
  setActiveTableNames
} from '../db'
import {
  deleteAutomationJobRecord,
  getAutomationJob,
  listAutomationJobs,
  mergeAutomationDraft,
  saveAutomationJobRecord
} from '../db/automation'
import { importTabular } from '../db/tabular'
import { logError, logInfo } from '../logger'
import { notifyAutomationResult } from '../notifications'
import {
  copyJobAttachments,
  deleteAutomationJobDir,
  deleteJobAttachments,
  mergeJobAttachments
} from './attachments'
import { createRunId, enqueueRun, getQueuedJobIds, isRunBusy, type EnqueueResult } from './queue'
import { computeNextRunAt } from './schedule'

function substitutePromptVars(prompt: string): string {
  const now = new Date()
  return prompt
    .replaceAll('{{date}}', now.toLocaleDateString('zh-CN'))
    .replaceAll('{{week}}', `第${Math.ceil(now.getDate() / 7)}周`)
    .replaceAll('{{datetime}}', now.toLocaleString('zh-CN'))
}

function importJobAttachments(job: AutomationJob): string[] {
  const before = new Set(getActiveTableNames())
  const imported: string[] = []
  for (const att of job.attachments) {
    const tables = importTabular(att.storedPath)
    for (const t of tables) {
      if (!before.has(t.table)) imported.push(t.table)
    }
  }
  if (imported.length) appendActiveTableNames(imported)
  return imported
}

export function enrichJobRuntimeStatus(jobs: AutomationJob[]): AutomationJob[] {
  const queued = getQueuedJobIds()
  return jobs.map((job) => {
    if (!job.enabled) {
      return { ...job, runtimeStatus: 'paused' as AutomationJobRuntimeStatus }
    }
    if (queued.includes(job.id)) {
      const pos = queued.indexOf(job.id) + 1
      return { ...job, runtimeStatus: 'waiting' as AutomationJobRuntimeStatus, queuePosition: pos }
    }
    if (job.runtimeStatus === 'running') {
      return { ...job, runtimeStatus: 'running' as AutomationJobRuntimeStatus }
    }
    return { ...job, runtimeStatus: 'idle' as AutomationJobRuntimeStatus }
  })
}

export function listJobsWithStatus(): AutomationJob[] {
  return enrichJobRuntimeStatus(listAutomationJobs())
}

export function saveAutomationJob(
  draft: AutomationJobDraft,
  attachmentSources?: { sourcePath: string; fileName: string }[]
): AutomationJob {
  const existing = draft.id ? getAutomationJob(draft.id) : null
  const jobId = draft.id ?? existing?.id ?? `automation-${Date.now()}-${randomUUID().slice(0, 8)}`

  let attachments = existing?.attachments ?? []
  if (attachmentSources?.length) {
    attachments = existing
      ? mergeJobAttachments(jobId, existing.attachments, attachmentSources, true)
      : copyJobAttachments(jobId, attachmentSources)
  } else if (!existing) {
    attachments = []
  }

  if (draft.mode === 'solution' && draft.solutionId && !getSolution(draft.solutionId)) {
    throw new Error('所选解决方案不存在')
  }

  const merged = mergeAutomationDraft(existing, { ...draft, id: jobId }, attachments)
  merged.nextRunAt = computeNextRunAt(merged.schedule)
  return saveAutomationJobRecord(merged)
}

export function deleteAutomationJob(id: string): void {
  deleteJobAttachments(id)
  deleteAutomationJobDir(id)
  deleteAutomationJobRecord(id)
}

export function toggleAutomationJob(id: string, enabled: boolean): AutomationJob {
  const job = getAutomationJob(id)
  if (!job) throw new Error('自动化任务不存在')
  const next = {
    ...job,
    enabled,
    updatedAt: Date.now(),
    nextRunAt: enabled ? computeNextRunAt(job.schedule) : undefined
  }
  return saveAutomationJobRecord(next)
}

export function triggerAutomationJob(jobId: string): EnqueueResult {
  const job = getAutomationJob(jobId)
  if (!job) throw new Error('自动化任务不存在')
  return executeAutomationJob(job, true)
}

export function executeAutomationJob(job: AutomationJob, manual = false): EnqueueResult {
  if (!job.enabled && !manual) return 'skipped'

  const now = Date.now()
  if (job.schedule.validFrom && now < job.schedule.validFrom) return 'skipped'
  if (job.schedule.validUntil && now > job.schedule.validUntil) return 'skipped'

  const snapshot = getActiveTableNames()
  let importedTables: string[] = []

  try {
    if (job.attachments.length) importedTables = importJobAttachments(job)
  } catch (err) {
    logError('automation', `附件导入失败 job=${job.id}`, err)
    finalizeJobRun(job, false, err instanceof Error ? err.message : String(err), randomUUID())
    return 'skipped'
  }

  const prompt = substitutePromptVars(job.prompt)
  const runId = createRunId()
  const mode = job.mode === 'solution' ? 'task' : 'chat'

  const onComplete = (result: { ok: boolean; finalText: string }): void => {
    setActiveTableNames(snapshot)
    finalizeJobRun(job, result.ok, result.finalText, runId)
  }

  const result = enqueueRun({
    runId,
    jobId: job.id,
    jobName: job.name,
    mode,
    prompt,
    solutionId: job.mode === 'solution' ? job.solutionId : undefined,
    bindings: { skillIds: job.skillIds, mcpServerIds: job.mcpServerIds },
    ignoreRisk: job.ignoreRisk,
    trigger: 'automation',
    runMeta: {
      trigger: 'automation',
      automationJobId: job.id,
      ignoreRisk: job.ignoreRisk
    },
    onComplete
  })

  if (result === 'overflow') {
    setActiveTableNames(snapshot)
    finalizeJobRun(job, false, '执行队列已满（最多等待 3 个任务）', runId, 'skipped')
    return 'overflow'
  }

  if (result === 'queued') {
    saveAutomationJobRecord({
      ...job,
      runtimeStatus: 'waiting',
      updatedAt: Date.now()
    })
  } else {
    saveAutomationJobRecord({
      ...job,
      runtimeStatus: 'running',
      updatedAt: Date.now()
    })
  }

  logInfo('automation', manual ? '立即执行' : '定时触发', {
    jobId: job.id,
    runId,
    result,
    importedTables
  })

  return result
}

function finalizeJobRun(
  job: AutomationJob,
  ok: boolean,
  finalText: string,
  runId: string,
  status: AutomationJob['lastStatus'] = ok ? 'success' : 'failed'
): void {
  const nextRunAt =
    job.schedule.kind === 'once' ? undefined : computeNextRunAt(job.schedule, Date.now())
  const updated: AutomationJob = {
    ...job,
    lastRunId: runId,
    lastStatus: status,
    nextRunAt,
    runtimeStatus: 'idle',
    queuePosition: undefined,
    enabled: job.schedule.kind === 'once' ? false : job.enabled,
    updatedAt: Date.now()
  }
  saveAutomationJobRecord(updated)
  notifyAutomationResult(job.name, ok, finalText, job.id, runId, job.notify)
}

export function onSchedulerTick(): void {
  const now = Date.now()
  for (const job of listAutomationJobs()) {
    if (!job.enabled || !job.nextRunAt || job.nextRunAt > now) continue
    if (job.onConflict === 'skip' && (getQueuedJobIds().length > 0 || isRunBusy())) {
      finalizeJobRun(job, false, '跳过：当前有任务正在执行', createRunId(), 'skipped')
      continue
    }
    executeAutomationJob(job, false)
  }
}
