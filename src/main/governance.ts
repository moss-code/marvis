import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { IPC } from '../shared/ipc'
import type {
  AgentEvent,
  ApprovalDecision,
  ApprovalDecisionResult,
  ApprovalRequest,
  ApprovalRiskLevel,
  AuditLogEntry,
  GovernanceState,
  PermissionPolicy,
  PonyId
} from '../shared/types'
import {
  getPermissionPolicy as getStoredPermissionPolicy,
  listApprovalRequests,
  listAuditLogs,
  listPermissionPolicies,
  listPonies,
  saveApprovalRequest,
  saveAuditLog,
  savePermissionPolicy as saveStoredPermissionPolicy
} from './db'
import { logInfo, logWarn } from './logger'
import { getWorkspaceDir } from './workspace'

const APPROVAL_TTL_MS = 2 * 60 * 1000
const TOKEN_TTL_MS = 60 * 1000
const SUMMARY_MAX = 260

type Emit = (e: AgentEvent) => void

interface PendingApproval {
  request: ApprovalRequest
  resolve: (result: ApprovalDecisionResult) => void
  timer: NodeJS.Timeout
}

interface ApprovalTokenRecord {
  requestId: string
  actionType: ApprovalRequest['actionType']
  toolName: string
  resource: string
  expiresAt: number
}

export interface GovernanceContext {
  runId?: string
  taskId?: string
  ponyId: PonyId
  ponyName?: string
  emit?: Emit
}

export interface GovernanceAction {
  toolName: string
  actionType: ApprovalRequest['actionType']
  resource: string
  riskLevel: ApprovalRiskLevel
  reason: string
  argsSummary: string
  requiresRead?: boolean
  requiresWrite?: boolean
  requiresMcp?: boolean
  requiresSkillScript?: boolean
  requiresReportExport?: boolean
  destructive?: boolean
  directRejectReason?: string
}

let getWindow: (() => BrowserWindow | null) | null = null
const pendingApprovals = new Map<string, PendingApproval>()
const approvalTokens = new Map<string, ApprovalTokenRecord>()

export function setGovernanceWindowProvider(fn: () => BrowserWindow | null): void {
  getWindow = fn
}

function truncate(value: string, n = SUMMARY_MAX): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > n ? `${text.slice(0, n)}...` : text
}

function redact(value: string): string {
  return truncate(
    value
      .replace(/(api[_-]?key|token|password|secret|authorization)(["'\s:=]+)([^"',\s}]+)/gi, '$1$2***')
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
  )
}

function containsSensitiveEnv(input: string): boolean {
  return /\b(API[_-]?KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)\b/i.test(input)
}

function defaultPolicy(ponyId: PonyId): PermissionPolicy {
  if (ponyId === 'file') {
    return {
      ponyId,
      level: 'approval_required_write',
      canReadFiles: true,
      canWriteFiles: true,
      canCallMcp: true,
      canRunSkillScript: false,
      canExportReports: true,
      updatedAt: 0
    }
  }

  return {
    ponyId,
    level: 'read_only',
    canReadFiles: true,
    canWriteFiles: false,
    canCallMcp: false,
    canRunSkillScript: false,
    canExportReports: false,
    updatedAt: 0
  }
}

export function getPermissionPolicy(ponyId: string): PermissionPolicy {
  const stored = getStoredPermissionPolicy(ponyId)
  if (stored) return stored
  return defaultPolicy(ponyId as PonyId)
}

export function savePermissionPolicy(policy: PermissionPolicy): PermissionPolicy {
  const pony = listPonies().find((p) => p.id === policy.ponyId)
  if (!pony) throw new Error(`小马不存在：${policy.ponyId}`)
  return saveStoredPermissionPolicy({
    ...policy,
    canReadFiles: Boolean(policy.canReadFiles),
    canWriteFiles: Boolean(policy.canWriteFiles),
    canCallMcp: Boolean(policy.canCallMcp),
    canRunSkillScript: Boolean(policy.canRunSkillScript),
    canExportReports: Boolean(policy.canExportReports)
  })
}

export function getGovernanceState(): GovernanceState {
  const requests = listApprovalRequests(80)
  const policiesById = new Map(listPermissionPolicies().map((p) => [p.ponyId, p]))
  const policies = listPonies().map((p) => policiesById.get(p.id) ?? defaultPolicy(p.id))
  return {
    pending: requests.filter((r) => r.status === 'pending' && r.expiresAt > Date.now()),
    recentRequests: requests,
    auditLogs: listAuditLogs(120),
    policies
  }
}

function writeAudit(
  ctx: GovernanceContext,
  action: GovernanceAction,
  decision: AuditLogEntry['decision'],
  resultSummary: string,
  requestId?: string
): void {
  saveAuditLog({
    id: randomUUID(),
    requestId,
    createdAt: Date.now(),
    ponyId: ctx.ponyId,
    ponyName: ctx.ponyName,
    toolName: action.toolName,
    actionType: action.actionType,
    resource: action.resource,
    riskLevel: action.riskLevel,
    argsSummary: redact(action.argsSummary),
    decision,
    resultSummary: redact(resultSummary)
  })
}

function evaluatePolicy(ctx: GovernanceContext, action: GovernanceAction): {
  allowed: boolean
  reason: string
  requiresApproval: boolean
} {
  const policy = getPermissionPolicy(ctx.ponyId)
  const args = `${action.resource} ${action.argsSummary}`

  if (action.directRejectReason) {
    return { allowed: false, reason: action.directRejectReason, requiresApproval: false }
  }
  if (containsSensitiveEnv(args)) {
    return { allowed: false, reason: '工具参数包含敏感环境变量或凭据字段', requiresApproval: false }
  }
  if (action.requiresMcp && !policy.canCallMcp) {
    return { allowed: false, reason: '该小马没有 MCP 调用权限', requiresApproval: false }
  }
  if (action.requiresRead && !policy.canReadFiles) {
    return { allowed: false, reason: '该小马没有文件读取权限', requiresApproval: false }
  }
  if (action.requiresSkillScript && !policy.canRunSkillScript) {
    return { allowed: false, reason: '该小马没有 Skill script 执行权限', requiresApproval: false }
  }
  if (action.requiresReportExport && !policy.canExportReports) {
    return { allowed: false, reason: '该小马没有报告导出/归档权限', requiresApproval: false }
  }
  if (action.requiresWrite && !policy.canWriteFiles) {
    return { allowed: false, reason: '该小马没有文件写入权限', requiresApproval: false }
  }
  if (policy.level === 'deny_dangerous' && (action.destructive || action.requiresSkillScript)) {
    return { allowed: false, reason: '当前策略禁止危险操作', requiresApproval: false }
  }

  const highRisk = action.riskLevel === 'high' || action.riskLevel === 'critical'
  const mustApprove = Boolean(
    action.requiresSkillScript ||
      action.destructive ||
      highRisk ||
      (policy.level === 'approval_required_write' &&
        (action.requiresWrite || action.requiresReportExport || action.requiresMcp))
  )

  return { allowed: true, reason: action.reason, requiresApproval: mustApprove }
}

function updateRequest(req: ApprovalRequest): ApprovalRequest {
  saveApprovalRequest(req)
  return req
}

async function requestApproval(
  ctx: GovernanceContext,
  action: GovernanceAction,
  reason: string
): Promise<string> {
  const win = getWindow?.()
  if (!win) {
    writeAudit(ctx, action, 'rejected', '没有可用窗口，无法展示审批')
    throw new Error('需要人工审批，但当前没有可用窗口')
  }

  const now = Date.now()
  const request: ApprovalRequest = {
    id: randomUUID(),
    runId: ctx.runId,
    taskId: ctx.taskId,
    ponyId: ctx.ponyId,
    ponyName: ctx.ponyName,
    toolName: action.toolName,
    actionType: action.actionType,
    resource: action.resource,
    riskLevel: action.riskLevel,
    reason,
    argsSummary: redact(action.argsSummary),
    status: 'pending',
    createdAt: now,
    expiresAt: now + APPROVAL_TTL_MS
  }

  updateRequest(request)
  ctx.emit?.({
    type: 'approval_required',
    runId: ctx.runId ?? 'manual',
    taskId: ctx.taskId ?? request.id,
    pony: ctx.ponyId,
    approvalId: request.id,
    tool: action.toolName,
    riskLevel: action.riskLevel,
    resource: action.resource,
    reason
  })
  win.webContents.send(IPC.GOVERNANCE_APPROVAL_REQUIRED, request)
  logInfo('governance', '发起审批', {
    requestId: request.id,
    pony: ctx.ponyId,
    tool: action.toolName,
    riskLevel: action.riskLevel
  })

  const result = await new Promise<ApprovalDecisionResult>((resolvePromise) => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(request.id)
      const expired = updateRequest({
        ...request,
        status: 'expired',
        decidedAt: Date.now(),
        decision: 'deny',
        resultSummary: '审批超时'
      })
      writeAudit(ctx, action, 'auto_deny', '审批超时', request.id)
      resolvePromise({ request: expired })
    }, APPROVAL_TTL_MS)
    pendingApprovals.set(request.id, { request, resolve: resolvePromise, timer })
  })

  if (!result.approvalToken) {
    throw new Error(result.request.resultSummary || '用户拒绝了本次操作')
  }

  validateAndConsumeApprovalToken(result.approvalToken, action)
  return result.approvalToken
}

export function resolveApprovalDecision(decision: ApprovalDecision): ApprovalDecisionResult {
  const pending = pendingApprovals.get(decision.requestId)
  if (!pending) throw new Error('审批请求不存在或已结束')

  clearTimeout(pending.timer)
  pendingApprovals.delete(decision.requestId)

  if (pending.request.expiresAt <= Date.now()) {
    const expired = updateRequest({
      ...pending.request,
      status: 'expired',
      decidedAt: Date.now(),
      decision: 'deny',
      resultSummary: '审批已过期'
    })
    const result = { request: expired }
    pending.resolve(result)
    return result
  }

  const allowed = decision.decision === 'allow'
  const request = updateRequest({
    ...pending.request,
    status: allowed ? 'approved' : 'denied',
    decidedAt: Date.now(),
    decision: decision.decision,
    resultSummary: allowed ? '用户允许' : decision.note || '用户拒绝'
  })

  const action: GovernanceAction = {
    toolName: request.toolName,
    actionType: request.actionType,
    resource: request.resource,
    riskLevel: request.riskLevel,
    reason: request.reason,
    argsSummary: request.argsSummary
  }
  writeAudit(
    { ponyId: request.ponyId, ponyName: request.ponyName, runId: request.runId, taskId: request.taskId },
    action,
    allowed ? 'allow' : 'deny',
    request.resultSummary ?? '',
    request.id
  )

  const result: ApprovalDecisionResult = { request }
  if (allowed) {
    const token = randomUUID()
    approvalTokens.set(token, {
      requestId: request.id,
      actionType: request.actionType,
      toolName: request.toolName,
      resource: request.resource,
      expiresAt: Date.now() + TOKEN_TTL_MS
    })
    result.approvalToken = token
  }
  pending.resolve(result)
  return result
}

export function validateAndConsumeApprovalToken(token: string, action: GovernanceAction): void {
  const record = approvalTokens.get(token)
  approvalTokens.delete(token)
  if (!record) throw new Error('审批 token 不存在或已被使用')
  if (record.expiresAt <= Date.now()) throw new Error('审批 token 已过期')
  if (
    record.actionType !== action.actionType ||
    record.toolName !== action.toolName ||
    record.resource !== action.resource
  ) {
    throw new Error('审批 token 与目标操作不匹配')
  }
}

export async function runGovernedAction<T>(
  ctx: GovernanceContext,
  action: GovernanceAction,
  execute: () => Promise<T> | T
): Promise<T> {
  const check = evaluatePolicy(ctx, action)
  if (!check.allowed) {
    writeAudit(ctx, action, 'rejected', check.reason)
    logWarn('governance', '拦截工具调用', {
      pony: ctx.ponyId,
      tool: action.toolName,
      reason: check.reason
    })
    throw new Error(check.reason)
  }

  if (check.requiresApproval) {
    await requestApproval(ctx, action, check.reason)
  }

  try {
    const result = await execute()
    writeAudit(ctx, action, check.requiresApproval ? 'allow' : 'auto_allow', '执行成功')
    return result
  } catch (err) {
    writeAudit(ctx, action, 'failed', err instanceof Error ? err.message : String(err))
    throw err
  }
}

export function resolveWorkspaceTarget(pathValue: string): string {
  const workspace = resolve(getWorkspaceDir())
  const workspaceReal = realpathSync.native(workspace)
  const target = resolve(isAbsolute(pathValue) ? pathValue : resolve(workspace, pathValue))
  const rel = relative(workspace, target)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`工作区外路径被拦截：${pathValue}`)
  }
  const targetReal = existsSync(target) ? realpathSync.native(target) : realpathSync.native(existingAncestor(target))
  const realRel = relative(workspaceReal, targetReal)
  if (realRel.startsWith('..') || isAbsolute(realRel)) {
    throw new Error(`符号链接逃逸被拦截：${pathValue}`)
  }
  return target
}

function existingAncestor(pathValue: string): string {
  let current = pathValue
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return current
}

export function collectPathLikeValues(value: unknown): string[] {
  const result: string[] = []
  const visit = (v: unknown, key = ''): void => {
    if (typeof v === 'string') {
      if (/path|file|target|source|destination|dir/i.test(key)) result.push(v)
      return
    }
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) {
      v.forEach((item) => visit(item, key))
      return
    }
    for (const [k, item] of Object.entries(v as Record<string, unknown>)) visit(item, k)
  }
  visit(value)
  return result
}
