/** IPC 契约：channel 常量与类型映射（经 preload 暴露为 window.api） */
import type {
  AgentEvent,
  ChatMessage,
  McpServerConfig,
  McpServerSpec,
  McpServerStatus,
  Pony,
  PonyDraft,
  ReportMeta,
  SelfCheckItem,
  Skill,
  TableSchema
} from './types'

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
  PONY_SAVE: 'pony:save',
  PONY_DELETE: 'pony:delete',
  SKILL_LIST: 'skill:list',
  SKILL_SAVE: 'skill:save',
  SKILL_DELETE: 'skill:delete',
  /** 重新扫描工作区 skills/（批量导入外部 Skill 目录后） */
  SKILL_RESCAN: 'skill:rescan',
  MCP_LIST: 'mcp:list',
  MCP_SAVE: 'mcp:save',
  MCP_DELETE: 'mcp:delete',
  MCP_TEST: 'mcp:test',
  MCP_STATUS: 'mcp:status',
  /** 主进程 → 渲染进程事件推送 */
  AGENT_EVENT: 'agent:event',
  /** 演示自检（串行跑完全部检查） */
  APP_SELF_CHECK: 'app:selfCheck'
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
  savePony(draft: PonyDraft): Promise<Pony>
  deletePony(id: string): Promise<void>
  listSkills(): Promise<Skill[]>
  saveSkill(s: {
    id?: string
    name: string
    description: string
    markdown: string
  }): Promise<Skill>
  deleteSkill(id: string): Promise<void>
  rescanSkills(): Promise<Skill[]>
  listMcpServers(): Promise<McpServerConfig[]>
  saveMcpServer(c: {
    id?: string
    name?: string
    spec?: McpServerSpec
    /** 标准 JSON（mcpServers 包装或直接 url/command） */
    json?: string
  }): Promise<McpServerConfig>
  deleteMcpServer(id: string): Promise<void>
  testMcpServer(id: string): Promise<McpServerStatus>
  mcpStatus(): Promise<McpServerStatus[]>
  selfCheck(): Promise<SelfCheckItem[]>
  onAgentEvent(cb: (e: AgentEvent) => void): () => void
}
