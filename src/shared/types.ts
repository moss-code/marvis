/** 核心共享数据模型 —— 主进程与渲染进程的唯一接口标准来源 */

export type PonyId = 'leader' | 'data' | 'report' | 'file' | 'writer' | (string & {})

export type PaletteId = 'linen' | 'camel' | 'ochre' | 'sage' | 'terracotta'

/** 配件槽（PonyActor 已支持这 4 种绘制） */
export type AccessoryId = 'glasses' | 'bowtie' | 'beret' | 'brass-tag'

export interface PonySkin {
  palette: PaletteId
  accessories: AccessoryId[]
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

export type ApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'failed'
export type ApprovalDecisionValue = 'allow' | 'deny'
export type PermissionPolicyLevel =
  | 'read_only'
  | 'workspace_write'
  | 'approval_required_write'
  | 'deny_dangerous'

export interface PermissionPolicy {
  ponyId: PonyId
  level: PermissionPolicyLevel
  canReadFiles: boolean
  canWriteFiles: boolean
  canCallMcp: boolean
  canRunSkillScript: boolean
  canExportReports: boolean
  updatedAt: number
}

export interface ApprovalRequest {
  id: string
  runId?: string
  taskId?: string
  ponyId: PonyId
  ponyName?: string
  toolName: string
  actionType:
    | 'file_write'
    | 'file_overwrite'
    | 'file_delete'
    | 'file_move'
    | 'mcp_call'
    | 'skill_script'
    | 'report_export'
  resource: string
  riskLevel: ApprovalRiskLevel
  reason: string
  argsSummary: string
  status: ApprovalStatus
  createdAt: number
  expiresAt: number
  decidedAt?: number
  decision?: ApprovalDecisionValue
  resultSummary?: string
}

export interface ApprovalDecision {
  requestId: string
  decision: ApprovalDecisionValue
  note?: string
}

export interface ApprovalDecisionResult {
  request: ApprovalRequest
  approvalToken?: string
}

export interface AuditLogEntry {
  id: string
  requestId?: string
  createdAt: number
  ponyId: PonyId
  ponyName?: string
  toolName: string
  actionType: ApprovalRequest['actionType'] | 'policy_check' | 'direct_reject'
  resource: string
  riskLevel: ApprovalRiskLevel
  argsSummary: string
  decision: ApprovalDecisionValue | 'auto_allow' | 'auto_deny' | 'rejected' | 'failed'
  resultSummary: string
}

export interface GovernanceState {
  pending: ApprovalRequest[]
  recentRequests: ApprovalRequest[]
  auditLogs: AuditLogEntry[]
  policies: PermissionPolicy[]
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

/** 数据资源状态：库存 + 当前对话选中 */
export interface DataResourceState {
  /** 全部 data_ 表（inventory） */
  tables: TableSchema[]
  /** 当前 Active 表名列表（须为 tables 的子集） */
  activeTables: string[]
}

export interface ReportMeta {
  id: string
  title: string
  createdAt: number
}

/** 历史任务摘要（run:list 返回，不含事件正文） */
export interface RunMeta {
  id: string
  userQuery: string
  ok: boolean
  startedAt: number
  durationMs: number
  eventCount: number
}

/** 模型配置（config:get 返回时 apiKey 脱敏） */
export interface ModelConfig {
  baseUrl: string
  /** get 返回形如 "sk-***k3F9"（前 3 后 4）；save 时空字符串 = 保持不变 */
  apiKey: string
  model: string
}

/** Skill 目录内的可选参考文件（reference.md / examples.md） */
export interface SkillReference {
  name: string
  content: string
}

/** Skill 目录 scripts/ 下的可执行脚本（相对 scripts/ 的路径） */
export interface SkillScript {
  file: string
}

/**
 * 一个 Skill —— 预置在 DB；自定义遵循 Cursor 目录规范（skills/<id>/SKILL.md）。
 * 勾选后注入小马 system prompt。
 */
export interface Skill {
  id: string
  name: string
  description: string
  /** SKILL.md 正文（frontmatter 之后） */
  markdown: string
  builtin: boolean
  updatedAt: number
  /** 工作区目录名（仅自定义 Skill） */
  path?: string
  /** 同目录下的 reference.md / examples.md（批量导入时保留） */
  references?: SkillReference[]
  /** scripts/ 目录下的脚本（勾选本 Skill 后小马可调用 run_skill_script 执行） */
  scripts?: SkillScript[]
}

/**
 * MCP server 连接规格 —— 与 Cursor / Claude Desktop 的 mcpServers 条目兼容。
 * 远程：{ url, headers? }；本地 stdio：{ command, args?, env? }
 */
export interface McpServerSpec {
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

/** 全局 MCP server 配置（内置 filesystem 除外，用户添加须符合 McpServerSpec） */
export interface McpServerConfig {
  id: string
  name: string
  spec: McpServerSpec
  builtin: boolean
}

/** 演示自检单项结果 */
export interface SelfCheckItem {
  name: string
  ok: boolean
  detail: string
}

/** 设置页展示用的运行状态 */
export interface McpServerStatus {
  id: string
  state: 'stopped' | 'starting' | 'running' | 'error'
  tools: string[]
  error?: string
}

/** 招聘/编辑小马的提交体（pony:save 入参） */
export interface PonyDraft {
  id?: string
  name: string
  role: string
  skin: PonySkin
  skills: string[]
  mcpServers: string[]
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
  | {
      type: 'task_dispatched'
      runId: string
      taskId: string
      from: 'leader'
      to: PonyId
      brief: string
      briefDetail?: string
    }
  /** 触发干活动画 */
  | {
      type: 'tool_call_started'
      runId: string
      taskId: string
      pony: PonyId
      tool: string
      argsSummary: string
      argsDetail?: string
    }
  | {
      type: 'approval_required'
      runId: string
      taskId: string
      pony: PonyId
      approvalId: string
      tool: string
      riskLevel: ApprovalRiskLevel
      resource: string
      reason: string
    }
  | {
      type: 'tool_call_finished'
      runId: string
      taskId: string
      pony: PonyId
      tool: string
      ok: boolean
      resultSummary: string
      resultDetail?: string
      durationMs: number
    }
  /** 触发成果传递 */
  | {
      type: 'task_completed'
      runId: string
      taskId: string
      pony: PonyId
      summary: string
      summaryDetail?: string
    }
  /** 触发挠头道歉 */
  | {
      type: 'task_failed'
      runId: string
      taskId: string
      pony: PonyId
      reason: string
      reasonDetail?: string
      retriesUsed: number
    }
  /** 触发钉白板 */
  | { type: 'report_ready'; runId: string; reportId: string; title: string }
  | { type: 'run_finished'; runId: string; ok: boolean; finalText: string }
