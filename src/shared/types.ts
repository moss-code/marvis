/** 核心共享数据模型 —— 主进程与渲染进程的唯一接口标准来源 */

export type PonyId = 'leader' | 'data' | 'report' | 'file' | 'writer' | (string & {})

export type PaletteId = 'linen' | 'camel' | 'ochre' | 'sage' | 'terracotta'

export interface PonySkin {
  palette: PaletteId
  accessories: string[]
}

export interface Pony {
  id: PonyId
  name: string
  /** 职能描述，领队马派单时据此判断 */
  role: string
  builtin: boolean
  skin: PonySkin
  /** skill id 列表（M2 暂为空，M4 启用） */
  skills: string[]
  /** 绑定的全局 MCP server id（M2 暂为空，M4 启用） */
  mcpServers: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'leader'
  content: string
  attachments?: { filename: string; kind: 'xlsx' }[]
  createdAt: number
}

export interface TableSchema {
  table: string
  columns: { name: string; type: string }[]
  rowCount: number
  /** 抽样 5 行，供数据马 prompt */
  sampleRows: Record<string, unknown>[]
}

export interface ReportMeta {
  id: string
  title: string
  createdAt: number
}

/**
 * Agent 事件协议 —— 驱动场景动画与任务日志的唯一事实源。
 * 渲染进程只消费此事件流，动画与日志是同一流的两个视图。
 */
export type AgentEvent =
  | { type: 'run_started'; runId: string; userQuery: string }
  | { type: 'leader_thinking'; runId: string }
  /** 流式增量文本 */
  | { type: 'leader_say'; runId: string; text: string }
  /** 触发行走 + 气泡 */
  | { type: 'task_dispatched'; runId: string; taskId: string; from: 'leader'; to: PonyId; brief: string }
  /** 触发干活动画 */
  | { type: 'tool_call_started'; runId: string; taskId: string; pony: PonyId; tool: string; argsSummary: string }
  | {
      type: 'tool_call_finished'
      runId: string
      taskId: string
      pony: PonyId
      tool: string
      ok: boolean
      resultSummary: string
      durationMs: number
    }
  /** 触发成果传递 */
  | { type: 'task_completed'; runId: string; taskId: string; pony: PonyId; summary: string }
  /** 触发挠头道歉 */
  | { type: 'task_failed'; runId: string; taskId: string; pony: PonyId; reason: string; retriesUsed: number }
  /** 触发钉白板 */
  | { type: 'report_ready'; runId: string; reportId: string; title: string }
  | { type: 'run_finished'; runId: string; ok: boolean; finalText: string }
