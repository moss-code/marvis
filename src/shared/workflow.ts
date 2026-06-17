/** 任务工作台协作工作流 —— 由 AgentEvent 流推导 */
import type { PonyId } from './types'

export type WorkflowNodeStatus = 'pending' | 'active' | 'done' | 'failed'

export interface WorkflowToolCall {
  tool: string
  argsSummary: string
  argsDetail?: string
  ok?: boolean
  resultSummary?: string
  resultDetail?: string
  durationMs?: number
}

export interface WorkflowNode {
  id: string
  kind: 'start' | 'leader' | 'dispatch' | 'report'
  ponyId?: PonyId
  ponyName: string
  label: string
  status: WorkflowNodeStatus
  brief?: string
  briefDetail?: string
  output?: string
  outputDetail?: string
  /** 模型完整原始回答（保留换行，供 Markdown 渲染） */
  rawOutput?: string
  toolCalls: WorkflowToolCall[]
  taskId?: string
  reportId?: string
}
