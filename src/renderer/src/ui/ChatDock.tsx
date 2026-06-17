import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { MarkdownBody } from '@/ui/MarkdownBody'
import { DataPicker } from '@/ui/DataPicker'
import { GovernancePolicyMenu } from '@/ui/GovernancePolicyMenu'
import { SessionBindingChips, SlashBindMenu, useSlashBind } from '@/ui/ComposerSessionBindings'
import { useChatScrollToBottom } from '@/ui/useChatScrollToBottom'

/** 右侧对话坞：消息流（用户 ↔ 领队马）+ 输入条 + 数据上传 */
const ACCEPTED_DATA_EXT = ['.xlsx', '.xls', '.csv', '.txt'] as const

const MIN_DOCK_WIDTH = 360
const MAX_DOCK_WIDTH = 760
const MIN_DOCK_HEIGHT = 360
const DEFAULT_TOP_GAP = 10

function getDefaultDockSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 480, height: 680 }
  return {
    width: Math.min(560, Math.max(420, window.innerWidth * 0.35)),
    height: Math.min(window.innerHeight - 48, Math.max(430, window.innerHeight - Math.max(150, window.innerHeight * 0.3) - DEFAULT_TOP_GAP))
  }
}

export function ChatDock({ onWidthChange }: { onWidthChange(width: number): void }): React.JSX.Element {
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
  const pendingTaskTemplate = useAppStore((s) => s.pendingTaskTemplate)
  const clearPendingTaskTemplate = useAppStore((s) => s.clearPendingTaskTemplate)
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [{ width, height }, setSize] = useState(getDefaultDockSize)
  const listRef = useRef<HTMLDivElement>(null)
  const inputAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onWidthChange(width + 28)
  }, [onWidthChange, width])

  useEffect(() => {
    if (!pendingTaskTemplate) return
    setText(pendingTaskTemplate)
    clearPendingTaskTemplate()
  }, [pendingTaskTemplate, clearPendingTaskTemplate])

  const activeSet = new Set(activeTableNames)
  const activeTables = tables.filter((t) => activeSet.has(t.table))

  useChatScrollToBottom(listRef, [chat, streaming])

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
  const slash = useSlashBind(text, setText, locked)

  const startResize =
    (mode: 'width' | 'height' | 'both') =>
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startY = event.clientY
      const startWidth = width
      const startHeight = height

      const onMove = (moveEvent: PointerEvent): void => {
        const nextWidth =
          mode === 'height'
            ? startWidth
            : Math.min(
                MAX_DOCK_WIDTH,
                Math.max(MIN_DOCK_WIDTH, startWidth - (moveEvent.clientX - startX))
              )
        const nextHeight =
          mode === 'width'
            ? startHeight
            : Math.min(
                window.innerHeight - DEFAULT_TOP_GAP - 12,
                Math.max(MIN_DOCK_HEIGHT, startHeight + (moveEvent.clientY - startY))
              )

        setSize({ width: nextWidth, height: nextHeight })
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    }

  return (
    <div
      className={`chat-dock panel ${dragOver ? 'drag-over' : ''}`}
      style={{ width, height }}
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

      <SessionBindingChips disabled={locked} />

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
        <GovernancePolicyMenu disabled={locked} />
        <div className="chat-input-anchor" ref={inputAnchorRef}>
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
                    : '给领队马下达任务；输入 / 绑定 Skill 或 MCP'
            }
            disabled={locked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (slash.onKeyDown(e)) return
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
          />
        </div>
        <SlashBindMenu slash={slash} disabled={locked} anchorRef={inputAnchorRef} />
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

      <button
        type="button"
        className="panel-resize-handle panel-resize-handle-left"
        aria-label="调整右侧交互区宽度"
        title="拖拽调整宽度"
        onPointerDown={startResize('width')}
      />
      <button
        type="button"
        className="panel-resize-handle panel-resize-handle-bottom"
        aria-label="调整右侧交互区高度"
        title="拖拽调整高度"
        onPointerDown={startResize('height')}
      />
      <button
        type="button"
        className="panel-resize-handle panel-resize-handle-corner"
        aria-label="调整右侧交互区大小"
        title="拖拽调整大小"
        onPointerDown={startResize('both')}
      />
    </div>
  )
}
