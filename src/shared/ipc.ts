/** IPC 契约：channel 常量与类型映射（经 preload 暴露为 window.api） */
import type { AgentEvent, ChatMessage, Pony, ReportMeta, TableSchema } from './types'

export const IPC = {
  /** 发起一轮任务（请求-响应仅确认受理，过程经 agent:event 推送） */
  CHAT_SEND: 'chat:send',
  CHAT_HISTORY: 'chat:history',
  /** 解析 xlsx 入库，返回 schema；不传 path 时由主进程弹文件选择框 */
  FILE_UPLOAD_XLSX: 'file:uploadXlsx',
  DB_LIST_TABLES: 'db:listTables',
  REPORT_GET: 'report:get',
  REPORT_LIST: 'report:list',
  REPORT_EXPORT_PDF: 'report:exportPdf',
  PONY_LIST: 'pony:list',
  /** 主进程 → 渲染进程事件推送 */
  AGENT_EVENT: 'agent:event'
} as const

/** preload 暴露给渲染进程的 API 形状 */
export interface WindowApi {
  chatSend(text: string, runId: string): Promise<void>
  chatHistory(): Promise<ChatMessage[]>
  uploadXlsx(path?: string): Promise<{ tables: TableSchema[] } | null>
  listTables(): Promise<TableSchema[]>
  getReport(reportId: string): Promise<{ html: string; title: string } | null>
  listReports(): Promise<ReportMeta[]>
  exportPdf(reportId: string): Promise<{ savedPath: string } | null>
  listPonies(): Promise<Pony[]>
  onAgentEvent(cb: (e: AgentEvent) => void): () => void
}
