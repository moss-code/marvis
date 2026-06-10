import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'

/** 右侧对话坞：消息流（用户 ↔ 领队马）+ 输入条 + 数据上传 */
export function ChatDock(): React.JSX.Element {
  const { chat, streaming, running, tables, send, upload } = useAppStore()
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat, streaming])

  const submit = (): void => {
    if (!text.trim() || running) return
    void send(text)
    setText('')
  }

  return (
    <div className="chat-dock panel">
      <div className="chat-messages" ref={listRef}>
        {chat.length === 0 && !streaming && (
          <div className="chat-empty">
            我是领队马，办公室的主管。上传 xlsx 数据，告诉我你想要什么，我来安排小马们干活。
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <span className="msg-author">{m.role === 'user' ? '老板' : '领队马'}</span>
            <div className="msg-body">{m.content}</div>
          </div>
        ))}
        {streaming && (
          <div className="msg msg-leader">
            <span className="msg-author">领队马</span>
            <div className="msg-body">
              {streaming}
              <span className="caret" />
            </div>
          </div>
        )}
      </div>

      {tables.length > 0 && (
        <div className="table-chips">
          {tables.map((t) => (
            <span key={t.table} className="chip" title={t.columns.map((c) => c.name).join('、')}>
              {t.table.replace(/^data_/, '')} · {t.rowCount} 行
            </span>
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <button className="btn btn-ghost" onClick={() => void upload()} disabled={running}>
          上传数据
        </button>
        <input
          className="chat-input"
          value={text}
          placeholder={running ? '小马们正在干活…' : '给领队马下达任务，例如：分析各营业厅业务表现并出一份报告'}
          disabled={running}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <button className="btn btn-primary" onClick={submit} disabled={running || !text.trim()}>
          {running ? '干活中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
