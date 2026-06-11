import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent } from '@shared/types'
import { useAppStore } from '@/store/appStore'
import { describeEvent, LOG_TONE_CLASS, type LogLine } from '@/ui/logLines'

function isExpandable(line: LogLine): boolean {
  return Boolean(line.fullText) || line.text.length > 96 || /…$|\.\.\.$/.test(line.text)
}

function LogEntry({ line }: { line: LogLine }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const expandable = isExpandable(line)
  const displayText = open && line.fullText ? line.fullText : line.text

  const toggle = (): void => {
    if (expandable) setOpen((v) => !v)
  }

  return (
    <div
      className={`log-entry ${LOG_TONE_CLASS[line.tone]}${expandable ? ' log-entry-expandable' : ''}${open ? ' log-entry-open' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      onKeyDown={(e) => {
        if (expandable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          toggle()
        }
      }}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
    >
      <div className={expandable && !open ? 'log-entry-clamped' : undefined}>{displayText}</div>
      {expandable && (
        <span className="log-entry-hint">
          {open
            ? '点击收起'
            : line.fullText
              ? '点击查看全文'
              : '点击展开'}
        </span>
      )}
    </div>
  )
}

/** 任务日志模态：点击场景日志屏打开，展示完整协作记录 */
export function TaskLog({ onClose }: { onClose(): void }): React.JSX.Element {
  const { events, replayEvents, replaying, replaySpeed, ponies, stopReplay, setReplaySpeed } =
    useAppStore()
  const listRef = useRef<HTMLDivElement>(null)
  const ponyName = (id: string): string => ponies.find((p) => p.id === id)?.name ?? id

  const source = replaying ? replayEvents : events
  const visible = source.filter((e) => e.type !== 'leader_say')

  const entries = useMemo(
    () =>
      [...visible]
        .reverse()
        .map((ev, i) => ({
          key: `${visible.length - 1 - i}-${ev.type}`,
          line: describeEvent(ev as AgentEvent, ponyName)
        }))
        .filter((x): x is { key: string; line: LogLine } => x.line !== null),
    [visible, ponies]
  )

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [entries.length])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="task-log-modal panel modal" onClick={(e) => e.stopPropagation()}>
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
        <div className="modal-header">
          <h2 className="modal-title serif">任务日志</h2>
          <button type="button" className="btn btn-ghost modal-close" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="task-log-list" ref={listRef}>
          {entries.length === 0 && (
            <div className="log-empty">
              {replaying
                ? '回放事件将显示在这里…'
                : '还没有任务。给领队马派活后，这里会记录小马们的协作细节。'}
            </div>
          )}
          {entries.map(({ key, line }) => (
            <LogEntry key={key} line={line} />
          ))}
        </div>
      </div>
    </div>
  )
}
