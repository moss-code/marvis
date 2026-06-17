import { useEffect, useState } from 'react'
import type { AgentEvent, RunMeta } from '@shared/types'
import { ReplayDirector } from '@/replay/ReplayDirector'
import { useAppStore } from '@/store/appStore'
import { WorkflowView } from '@/ui/WorkflowView'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

interface Props {
  onClose: () => void
}

export function RunHistoryPanel({ onClose }: Props): React.JSX.Element {
  const running = useAppStore((s) => s.running)
  const replaying = useAppStore((s) => s.replaying)
  const startReplay = useAppStore((s) => s.startReplay)
  const [runs, setRuns] = useState<RunMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [workflowEvents, setWorkflowEvents] = useState<AgentEvent[]>([])
  const [workflowLoading, setWorkflowLoading] = useState(false)

  useEffect(() => {
    void window.api.listRuns().then((list) => {
      setRuns(list)
      setLoading(false)
    })
  }, [])

  const toggleWorkflow = async (runId: string): Promise<void> => {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      setWorkflowEvents([])
      return
    }
    setExpandedRunId(runId)
    setWorkflowLoading(true)
    const events = await window.api.getRun(runId)
    setWorkflowEvents(events ?? [])
    setWorkflowLoading(false)
  }

  const replay = async (runId: string): Promise<void> => {
    const events = await window.api.getRun(runId)
    if (!events?.length) return
    onClose()
    startReplay(events)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel run-history-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="serif modal-title">任务历史</h2>
          <button className="btn btn-ghost modal-close" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="modal-body">
          {loading && <p className="form-hint">加载中…</p>}
          {!loading && runs.length === 0 && (
            <p className="form-hint">还没有历史任务。完成一轮对话后会出现在这里。</p>
          )}
          <ul className="settings-list run-history-list">
            {runs.map((run) => (
              <li key={run.id} className="settings-list-item-wrap">
                <div className="settings-list-item run-history-row">
                  <span className={`run-badge ${run.ok ? 'ok' : 'fail'}`}>
                    {run.ok ? '成功' : '失败'}
                  </span>
                  <span className="run-time">{formatTime(run.startedAt)}</span>
                  <span className="run-query" title={run.userQuery}>
                    {run.userQuery}
                  </span>
                  <span className="run-meta">
                    {formatDuration(run.durationMs)} · {run.eventCount} 事件
                  </span>
                  <button
                    className={`btn btn-ghost btn-sm${expandedRunId === run.id ? ' active' : ''}`}
                    onClick={() => void toggleWorkflow(run.id)}
                  >
                    {expandedRunId === run.id ? '收起工作流' : '查看工作流'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={running || replaying}
                    title={running ? '任务运行中不可回放' : replaying ? '正在回放' : undefined}
                    onClick={() => void replay(run.id)}
                  >
                    回放
                  </button>
                </div>
                {expandedRunId === run.id && (
                  <div className="run-workflow-expand">
                    {workflowLoading ? (
                      <p className="form-hint">正在加载工作流…</p>
                    ) : (
                      <WorkflowView events={workflowEvents} variant="embedded" />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
