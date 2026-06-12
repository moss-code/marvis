import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { MarkdownBody } from '@/ui/MarkdownBody'
import { DataPicker } from '@/ui/DataPicker'
import { GovernancePolicyMenu } from '@/ui/GovernancePolicyMenu'

/** 右侧对话坞：消息流（用户 ↔ 领队马）+ 输入条 + 数据上传 */
const ACCEPTED_DATA_EXT = ['.xlsx', '.xls', '.csv', '.txt'] as const

export function ChatDock(): React.JSX.Element {
  const {
    chat,
    streaming,
    running,
    cancelling,
    replaying,
    selfChecking,
    tables,
    activeTableNames,
    send,
    upload,
    cancelRun,
    setActiveTables,
    removeFromActive
  } = useAppStore()
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const activeSet = new Set(activeTableNames)
  const activeTables = tables.filter((t) => activeSet.has(t.table))

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat, streaming])

  const submit = (): void => {
    if (!text.trim() || running || replaying || selfChecking) return
    void send(text)
    setText('')
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const name = file.name.toLowerCase()
    if (!ACCEPTED_DATA_EXT.some((ext) => name.endsWith(ext))) return
    const path = window.api.getPathForFile(file)
    void upload(path)
  }

  const locked = running || replaying || selfChecking

  return (
    <div
      className={`chat-dock panel ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!locked) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {replaying && (
        <div className="chat-replay-hint">正在回放历史任务，输入已锁定</div>
      )}
      <div className="chat-messages" ref={listRef}>
        {chat.length === 0 && !streaming && (
          <div className="chat-empty">
            我是领队马，办公室的主管。上传数据文件（xlsx / csv / txt），告诉我你想要什么，我来安排小马们干活。
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <span className="msg-author">{m.role === 'user' ? '老板' : '领队马'}</span>
            <div className="msg-body">
              {m.role === 'leader' ? <MarkdownBody>{m.content}</MarkdownBody> : m.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="msg msg-leader">
            <span className="msg-author">领队马</span>
            <div className="msg-body">
              <MarkdownBody>{streaming}</MarkdownBody>
              <span className="caret" />
            </div>
          </div>
        )}
      </div>

      {activeTables.length > 0 ? (
        <div className="table-chips">
          {activeTables.map((t) => (
            <span
              key={t.table}
              className="chip chip-active"
              title={t.columns.map((c) => c.name).join('、')}
            >
              {t.table.replace(/^data_/, '')} · {t.rowCount} 行
              <button
                type="button"
                className="chip-remove"
                disabled={locked}
                aria-label={`移出 ${t.table.replace(/^data_/, '')}`}
                onClick={() => void removeFromActive(t.table)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        tables.length > 0 && (
          <p className="table-chips-empty">未选择数据资源，请点击「选择数据」或上传文件</p>
        )
      )}

      <GovernancePolicyMenu disabled={locked} />

      <div className="chat-input-row">
        <button className="btn btn-ghost" onClick={() => void upload()} disabled={locked}>
          上传数据
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setPickerOpen(true)}
          disabled={locked || tables.length === 0}
        >
          选择数据
        </button>
        <textarea
          className="chat-input chat-textarea"
          rows={2}
          value={text}
          placeholder={
            replaying
              ? '正在回放历史任务…'
              : selfChecking
                ? '演示自检进行中…'
                : running
                  ? '小马们正在干活…'
                  : '给领队马下达任务，例如：分析各营业厅业务表现并出一份报告'
          }
          disabled={locked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {running ? (
          <button
            className="btn btn-stop"
            onClick={() => void cancelRun()}
            disabled={cancelling}
          >
            {cancelling ? '停止中…' : '■ 停止'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={submit} disabled={locked || !text.trim()}>
            {selfChecking ? '自检中…' : '发送'}
          </button>
        )}
      </div>

      <DataPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        tables={tables}
        activeTableNames={activeTableNames}
        onConfirm={(names) => void setActiveTables(names)}
      />
    </div>
  )
}
