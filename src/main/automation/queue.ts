import { randomUUID } from 'node:crypto'
import type { AgentEvent, RunContextMeta, SessionBindings } from '../../shared/types'
import type { Emitter } from '../agents'
import { startRun } from '../agents'
import { setAutomationRunContext } from '../governance'
import { logInfo } from '../logger'

export interface QueuedRun {
  runId: string
  jobId?: string
  jobName?: string
  mode: 'chat' | 'task'
  prompt: string
  solutionId?: string
  bindings: SessionBindings
  ignoreRisk: boolean
  trigger: 'manual' | 'automation'
  runMeta: RunContextMeta
  onComplete?: (result: { ok: boolean; finalText: string }) => void
}

export type EnqueueResult = 'started' | 'queued' | 'overflow' | 'skipped'

const MAX_QUEUE = 3

let emitFn: Emitter = () => {}
let queue: QueuedRun[] = []
let running = false
let currentRun: { runId: string; controller: AbortController } | null = null

export function initRunQueue(emit: Emitter): void {
  emitFn = emit
}

export function isRunBusy(): boolean {
  return running
}

export function getCurrentRunId(): string | undefined {
  return currentRun?.runId
}

export function getQueueLength(): number {
  return queue.length
}

export function getQueuedJobIds(): string[] {
  return queue.map((q) => q.jobId).filter((id): id is string => Boolean(id))
}

export function cancelQueuedRun(runId: string): void {
  if (currentRun?.runId === runId) {
    currentRun.controller.abort()
    return
  }
  queue = queue.filter((q) => q.runId !== runId)
}

export function enqueueRun(item: QueuedRun): EnqueueResult {
  if (!running) {
    void drainOne(item)
    return 'started'
  }
  if (queue.length >= MAX_QUEUE) return 'overflow'
  queue.push(item)
  logInfo('automation', '任务入队', { runId: item.runId, jobId: item.jobId, queueLen: queue.length })
  return 'queued'
}

async function drainOne(item: QueuedRun): Promise<void> {
  running = true
  const controller = new AbortController()
  currentRun = { runId: item.runId, controller }

  setAutomationRunContext(
    item.ignoreRisk
      ? { jobId: item.jobId ?? item.runId, ignoreRisk: true, jobName: item.jobName }
      : null
  )

  let finalOk = false
  let finalText = ''

  const wrappedEmit: Emitter = (e: AgentEvent) => {
    emitFn(e)
    if (e.type === 'run_finished' && e.runId === item.runId) {
      finalOk = e.ok
      finalText = e.finalText
    }
  }

  try {
    await startRun(
      item.runId,
      item.prompt,
      wrappedEmit,
      controller.signal,
      item.mode,
      item.solutionId,
      item.bindings,
      item.runMeta
    )
  } finally {
    setAutomationRunContext(null)
    running = false
    currentRun = null
    item.onComplete?.({ ok: finalOk, finalText })
    const next = queue.shift()
    if (next) void drainOne(next)
  }
}

export function enqueueManualRun(
  runId: string,
  prompt: string,
  mode: 'chat' | 'task',
  solutionId?: string,
  bindings?: SessionBindings
): void {
  if (running) throw new Error('小马们正在干活，请等本轮任务完成')
  void drainOne({
    runId,
    mode,
    prompt,
    solutionId,
    bindings: bindings ?? { skillIds: [], mcpServerIds: [] },
    ignoreRisk: false,
    trigger: 'manual',
    runMeta: { trigger: 'manual' }
  })
}

export function createRunId(): string {
  return randomUUID()
}
