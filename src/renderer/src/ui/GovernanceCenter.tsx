import { useMemo, useState } from 'react'
import type { ApprovalRequest, AuditLogEntry } from '@shared/types'
import { useAppStore } from '@/store/appStore'
import { HoverTip } from '@/ui/HoverTip'

const riskOptions = ['all', 'low', 'medium', 'high', 'critical'] as const

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

function riskText(risk: string): string {
  return risk === 'critical' ? '严重' : risk === 'high' ? '高' : risk === 'medium' ? '中' : '低'
}

function statusText(status: ApprovalRequest['status']): string {
  const map: Record<ApprovalRequest['status'], string> = {
    pending: '待审批',
    approved: '已允许',
    denied: '已拒绝',
    expired: '已过期',
    failed: '失败'
  }
  return map[status]
}

function summarizeRequest(req: ApprovalRequest): string {
  return [
    `审批 ${req.id}`,
    `小马: ${req.ponyName ?? req.ponyId}`,
    `工具: ${req.toolName}`,
    `资源: ${req.resource}`,
    `风险: ${riskText(req.riskLevel)}`,
    `原因: ${req.reason}`,
    `参数: ${req.argsSummary}`
  ].join('\n')
}

function RequestRow({ req }: { req: ApprovalRequest }): React.JSX.Element {
  const decideApproval = useAppStore((s) => s.decideApproval)
  const [busy, setBusy] = useState(false)

  const decide = async (decision: 'allow' | 'deny'): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await decideApproval(req.id, decision)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`governance-row risk-${req.riskLevel}`}>
      <div className="governance-row-main">
        <div className="governance-row-title">
          <strong>{req.toolName}</strong>
          <span>{req.ponyName ?? req.ponyId}</span>
        </div>
        <HoverTip text={req.resource} className="governance-row-resource">
          <small>{req.resource}</small>
        </HoverTip>
      </div>
      <div className="governance-row-meta">
        <span>{riskText(req.riskLevel)}</span>
        <span>{statusText(req.status)}</span>
        <span>{formatTime(req.createdAt)}</span>
      </div>
      <p>{req.reason}</p>
      <HoverTip text={req.argsSummary} className="governance-args-wrap" multiline>
        <code>{req.argsSummary}</code>
      </HoverTip>
      <div className="governance-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void navigator.clipboard?.writeText(summarizeRequest(req))}
        >
          复制摘要
        </button>
        {req.status === 'pending' && (
          <>
            <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => void decide('deny')}>
              拒绝
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void decide('allow')}>
              允许
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function AuditRow({ entry }: { entry: AuditLogEntry }): React.JSX.Element {
  return (
    <li className={`governance-row risk-${entry.riskLevel}`}>
      <div className="governance-row-main">
        <div className="governance-row-title">
          <strong>{entry.toolName}</strong>
          <span>{entry.ponyName ?? entry.ponyId}</span>
        </div>
        <HoverTip text={entry.resource} className="governance-row-resource">
          <small>{entry.resource}</small>
        </HoverTip>
      </div>
      <div className="governance-row-meta">
        <span>{riskText(entry.riskLevel)}</span>
        <span>{entry.decision}</span>
        <span>{formatTime(entry.createdAt)}</span>
      </div>
      <p>{entry.resultSummary}</p>
      <HoverTip text={entry.argsSummary} className="governance-args-wrap" multiline>
        <code>{entry.argsSummary}</code>
      </HoverTip>
    </li>
  )
}

export function GovernanceCenter(): React.JSX.Element | null {
  const governanceOpen = useAppStore((s) => s.governanceOpen)
  const closeGovernance = useAppStore((s) => s.closeGovernance)
  const pendingApprovals = useAppStore((s) => s.pendingApprovals)
  const approvalHistory = useAppStore((s) => s.approvalHistory)
  const auditLogs = useAppStore((s) => s.auditLogs)
  const ponies = useAppStore((s) => s.ponies)
  const [tab, setTab] = useState<'pending' | 'history' | 'audit'>('pending')
  const [risk, setRisk] = useState<(typeof riskOptions)[number]>('all')
  const [ponyId, setPonyId] = useState('all')
  const [tool, setTool] = useState('')

  const requestSource = tab === 'pending' ? pendingApprovals : approvalHistory
  const filteredRequests = useMemo(() => {
    return requestSource.filter((req) => {
      if (risk !== 'all' && req.riskLevel !== risk) return false
      if (ponyId !== 'all' && req.ponyId !== ponyId) return false
      if (tool.trim() && !req.toolName.toLowerCase().includes(tool.trim().toLowerCase())) return false
      return true
    })
  }, [ponyId, requestSource, risk, tool])

  const filteredAudit = useMemo(() => {
    return auditLogs.filter((entry) => {
      if (risk !== 'all' && entry.riskLevel !== risk) return false
      if (ponyId !== 'all' && entry.ponyId !== ponyId) return false
      if (tool.trim() && !entry.toolName.toLowerCase().includes(tool.trim().toLowerCase())) return false
      return true
    })
  }, [auditLogs, ponyId, risk, tool])

  if (!governanceOpen) return null

  return (
    <div className="modal-overlay modal-overlay--portal">
      <section className="modal panel governance-panel">
        <header className="modal-header">
          <div>
            <h2 className="modal-title serif">治理中心</h2>
            <p className="form-hint">审批队列、权限策略和审计记录</p>
          </div>
          <button className="btn btn-ghost modal-close" onClick={closeGovernance}>
            关闭
          </button>
        </header>

        <div className="settings-tabs">
          <button className={`settings-tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
            待审批 {pendingApprovals.length ? `(${pendingApprovals.length})` : ''}
          </button>
          <button className={`settings-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            审批历史
          </button>
          <button className={`settings-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>
            审计日志
          </button>
        </div>

        <div className="governance-filters">
          <select value={risk} onChange={(e) => setRisk(e.target.value as (typeof riskOptions)[number])}>
            {riskOptions.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? '全部风险' : riskText(item)}
              </option>
            ))}
          </select>
          <select value={ponyId} onChange={(e) => setPonyId(e.target.value)}>
            <option value="all">全部小马</option>
            {ponies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="工具名" />
        </div>

        <div className="modal-body governance-body">
          {tab !== 'audit' && (
            <ul className="governance-list">
              {filteredRequests.length === 0 && <li className="governance-empty">暂无匹配的审批请求</li>}
              {filteredRequests.map((req) => (
                <RequestRow key={req.id} req={req} />
              ))}
            </ul>
          )}
          {tab === 'audit' && (
            <ul className="governance-list">
              {filteredAudit.length === 0 && <li className="governance-empty">暂无匹配的审计记录</li>}
              {filteredAudit.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
