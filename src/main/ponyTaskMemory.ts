import type { PonyId } from '../shared/types'
import { logInfo } from './logger'

export interface PonyTaskToolTrace {
  tool: string
  ok: boolean
  summary: string
}

export interface PonyTaskMemory {
  runId: string
  ponyId: PonyId
  taskId: string
  brief: string
  toolTrace: PonyTaskToolTrace[]
  failureReason: string
  modelText?: string
  savedAt: number
}

const reusableMemories = new Map<string, PonyTaskMemory>()

function memoryKey(runId: string, ponyId: PonyId): string {
  return `${runId}:${ponyId}`
}

const MAX_BRIEF_CHARS = 600
const MAX_FAILURE_CHARS = 800
const MAX_MODEL_CHARS = 400
const MAX_TOOL_TRACE = 12
const MAX_TOOL_SUMMARY = 200

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** 子任务失败时保存续跑记忆（同 run、同马下次派单可注入 prompt） */
export function savePonyTaskMemory(memory: PonyTaskMemory): void {
  const key = memoryKey(memory.runId, memory.ponyId)
  reusableMemories.set(key, {
    ...memory,
    brief: truncate(memory.brief, MAX_BRIEF_CHARS),
    failureReason: truncate(memory.failureReason, MAX_FAILURE_CHARS),
    modelText: memory.modelText ? truncate(memory.modelText, MAX_MODEL_CHARS) : undefined,
    toolTrace: memory.toolTrace.slice(-MAX_TOOL_TRACE).map((t) => ({
      ...t,
      summary: truncate(t.summary, MAX_TOOL_SUMMARY)
    }))
  })
  logInfo('pony-memory', '已保存子马任务记忆', {
    runId: memory.runId,
    ponyId: memory.ponyId,
    taskId: memory.taskId,
    toolSteps: memory.toolTrace.length
  })
}

/** 同 run、同马再次派单时取出记忆（一次性消费） */
export function consumePonyTaskMemory(runId: string, ponyId: PonyId): PonyTaskMemory | undefined {
  const key = memoryKey(runId, ponyId)
  const memory = reusableMemories.get(key)
  if (!memory) return undefined
  reusableMemories.delete(key)
  logInfo('pony-memory', '已注入子马任务记忆', {
    runId,
    ponyId,
    priorTaskId: memory.taskId,
    toolSteps: memory.toolTrace.length
  })
  return memory
}

export function clearPonyTaskMemory(runId: string, ponyId: PonyId): void {
  reusableMemories.delete(memoryKey(runId, ponyId))
}

export function formatPonyTaskMemoryForPrompt(memory: PonyTaskMemory): string {
  const tools =
    memory.toolTrace.length > 0
      ? memory.toolTrace
          .map((t, i) => `${i + 1}. ${t.tool} ${t.ok ? '✓' : '✗'} ${t.summary}`)
          .join('\n')
      : '（无工具记录）'

  const parts = [
    '【上轮同马任务失败续跑 · 勿重复已失败步骤；以本轮领队 brief 为最终目标】',
    `- 上轮 taskId：${memory.taskId}`,
    `- 上轮 brief 摘要：${memory.brief}`,
    `- 失败原因：${memory.failureReason}`,
    `- 已执行工具：\n${tools}`
  ]

  if (memory.modelText) {
    parts.push(`- 上轮小马说明：${memory.modelText}`)
  }

  parts.push(
    '- 沙箱目录若已复用，优先修改 scripts/ 已有脚本后 run_sandbox_script → promote_sandbox_file，不要从零重写除非必要'
  )

  return parts.join('\n')
}

/** 将续跑记忆与本轮 brief 合并为子马 prompt */
export function buildPonyTaskPrompt(brief: string, priorMemory?: PonyTaskMemory): string {
  if (!priorMemory) return brief
  return `${formatPonyTaskMemoryForPrompt(priorMemory)}\n\n【本轮领队 brief】\n${brief}`
}
