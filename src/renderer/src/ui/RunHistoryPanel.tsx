import { useEffect, useState } from 'react'
import type { AgentEvent, RunMeta } from '@shared/types'
import { ReplayDirector } from '@/replay/ReplayDirector'
import { useAppStore } from '@/store/appStore'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function describeEvent(ev: AgentEvent, ponyName: (id: string) => string): string | null {
  switch (ev.type) {
    case 'run_started':
      return `任务开始：${ev.userQuery}`
    case 'leader_thinking':
      return '领队马思考中…'
    case 'task_dispatched':
      return `领队马 → ${ponyName(ev.to)}：${ev.brief}`
    case 'tool_call_started':
      return `${ponyName(ev.pony)} 调用 ${ev.tool}：${ev.argsSummary}`
    case 'tool_call_finished':
      return `${ponyName(ev.pony)} ${ev.tool} ${ev.ok ? '成功' : '失败'}（${ev.durationMs}ms）`
    case 'task_completed':
      return `${ponyName(ev.pony)} 完成任务：${ev.summary}`
    case 'task_failed':
      return `${ponyName(ev.pony)} 任务失败：${ev.reason}`
    case 'report_ready':
      return `报告《${ev.title}》已钉上白板`
    case 'run_finished':
      return ev.ok ? '本轮任务完成' : `结束：${ev.finalText}`
    default:
      return null
  }
}

interface Props {
  onClose: () => void
}

export function RunHistoryPanel({ onClose }: Props): React.JSX.Element {
  const running = useAppStore((s) => s.running)
  const replaying = useAppStore((s) => s.replaying)
  const ponies = useAppStore((s) => s.ponies)
  const startReplay = useAppStore((s) => s.startReplay)
  const [runs, setRuns] = useState<RunMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [logRunId, setLogRunId] = useState<string | null>(null)
  const [logEvents, setLogEvents] = useState<AgentEvent[]>([])
  const [logLoading, setLogLoading] = useState(false)

  useEffect(() => {
    void window.api.listRuns().then((list) => {
      setRuns(list)
      setLoading(false)
    })
  }, [])

  const ponyName = (id: string): string => ponies.find((p) => p.id === id)?.name ?? id

  const viewLog = async (runId: string): Promise<void> => {
    setLogLoading(true)
    setLogRunId(runId)
    const events = await window.api.getRun(runId)
    setLogEvents(events ?? [])
    setLogLoading(false)
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
                  <span className="run-meta">{formatDuration(run.durationMs)} · {run.eventCount} 事件</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => void viewLog(run.id)}>
                    查看日志
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
              </li>
            ))}
          </ul>

          {logRunId && (
            <div className="run-log-view panel">
              <div className="run-log-header">
                <strong>事件日志</strong>
                <button className="btn btn-ghost btn-sm" onClick={() => setLogRunId(null)}>
                  关闭
                </button>
              </div>
              {logLoading && <p className="form-hint">加载中…</p>}
              <div className="task-log-list run-log-body">
                {!logLoading &&
                  logEvents
                    .filter((e) => e.type !== 'leader_say')
                    .map((ev, i) => {
                      const text = describeEvent(ev, ponyName)
                      if (!text) return null
                      return (
                        <div key={i} className="log-entry">
                          {text}
                        </div>
                      )
                    })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
