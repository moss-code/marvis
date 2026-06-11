import { useEffect, useRef } from 'react'
import type { AgentEvent } from '@shared/types'
import { useAppStore } from '@/store/appStore'

function describe(ev: AgentEvent, ponyName: (id: string) => string): string | null {
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
      return `${ponyName(ev.pony)} ${ev.tool} ${ev.ok ? '成功' : '失败'}（${ev.durationMs}ms）：${ev.resultSummary}`
    case 'task_completed':
      return `${ponyName(ev.pony)} 完成任务：${ev.summary}`
    case 'task_failed':
      return `${ponyName(ev.pony)} 任务失败（重试 ${ev.retriesUsed} 次）：${ev.reason}`
    case 'report_ready':
      return `报告《${ev.title}》已钉上白板`
    case 'run_finished':
      return ev.ok ? '本轮任务完成' : `本轮任务异常结束：${ev.finalText}`
    default:
      return null
  }
}

const TONE: Partial<Record<AgentEvent['type'], string>> = {
  run_started: 'log-strong',
  task_dispatched: 'log-dispatch',
  task_failed: 'log-error',
  report_ready: 'log-report',
  run_finished: 'log-strong'
}

/** 右侧任务日志：协作过程的文字视图（与场景动画同源） */
export function TaskLog(): React.JSX.Element {
  const { events, replayEvents, replaying, replaySpeed, ponies, logOpen, toggleLog, stopReplay, setReplaySpeed } =
    useAppStore()
  const listRef = useRef<HTMLDivElement>(null)
  const ponyName = (id: string): string => ponies.find((p) => p.id === id)?.name ?? id

  const source = replaying ? replayEvents : events
  const visible = source.filter((e) => e.type !== 'leader_say')

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [visible.length])

  return (
    <div className={`task-log panel ${logOpen ? '' : 'collapsed'}`}>
      {replaying && (
        <div className="replay-banner">
          <span>回放中</span>
          <div className="replay-controls">
            <button
              className={`btn btn-ghost btn-sm ${replaySpeed === 1 ? 'active' : ''}`}
              onClick={() => setReplaySpeed(1)}
            >
              1x
            </button>
            <button
              className={`btn btn-ghost btn-sm ${replaySpeed === 2 ? 'active' : ''}`}
              onClick={() => setReplaySpeed(2)}
            >
              2x
            </button>
            <button className="btn btn-ghost btn-sm" onClick={stopReplay}>
              停止回放
            </button>
          </div>
        </div>
      )}
      <div className="task-log-header" onClick={toggleLog}>
        <span className="serif">任务日志</span>
        <span className="log-toggle">{logOpen ? '收起' : `展开${visible.length ? ` (${visible.length})` : ''}`}</span>
      </div>
      {logOpen && (
        <div className="task-log-list" ref={listRef}>
          {visible.length === 0 && (
            <div className="log-empty">
              {replaying
                ? '回放事件将显示在这里…'
                : '还没有任务。给领队马派活后，这里会记录小马们的协作细节。'}
            </div>
          )}
          {visible.map((ev, i) => {
            const text = describe(ev, ponyName)
            if (!text) return null
            return (
              <div key={i} className={`log-entry ${TONE[ev.type] ?? ''}`}>
                {text}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
