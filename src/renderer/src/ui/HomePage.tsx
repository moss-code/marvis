import { useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { MarkdownBody } from '@/ui/MarkdownBody'
import { DataPicker } from '@/ui/DataPicker'
import { SessionBindingChips, SlashBindMenu, useSlashBind } from '@/ui/ComposerSessionBindings'
import { useChatScrollToBottom } from '@/ui/useChatScrollToBottom'
import type { PaletteId, Pony, PonyId } from '@shared/types'

interface AgentHomeContentProps {
  userName: string
  onOpenWorkspace(): void
}

const prompts = [
  '介绍一下你能帮我做什么',
  '帮我梳理一份经营分析思路',
  '根据已上传的数据生成分析报告'
]

const ponyColors: Record<PaletteId, { body: string; mane: string }> = {
  linen: { body: '#d9d6cf', mane: '#a9a49a' },
  camel: { body: '#c3ad91', mane: '#83725f' },
  ochre: { body: '#c9aa86', mane: '#916f52' },
  sage: { body: '#aeb8a5', mane: '#737f6c' },
  terracotta: { body: '#c08b78', mane: '#895e50' }
}

export function AgentHomeContent({ userName, onOpenWorkspace }: AgentHomeContentProps): React.JSX.Element {
  const { chat, streaming, running, currentRunId, events, ponies, tables, activeTableNames, send, upload, cancelRun, removeFromActive, setActiveTables } = useAppStore()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'chat' | 'task'>('chat')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [historyCount] = useState(chat.length)
  const listRef = useRef<HTMLDivElement>(null)
  const composerAnchorRef = useRef<HTMLDivElement>(null)
  const activeTables = tables.filter((table) => activeTableNames.includes(table.table))
  const historyMessages = chat.slice(0, historyCount)
  const currentMessages = chat.slice(historyCount)
  const visiblePonies = ponies.slice(0, 5)
  const busyPonies = new Set<PonyId>()
  if (running && currentRunId) {
    for (const event of events.filter((item) => 'runId' in item && item.runId === currentRunId)) {
      if (event.type === 'task_dispatched') busyPonies.add(event.to)
      if (event.type === 'task_completed' || event.type === 'task_failed') busyPonies.delete(event.pony)
    }
  }

  useChatScrollToBottom(listRef, [chat, streaming])
  const slash = useSlashBind(text, setText, running)

  const submit = (): void => {
    const value = text.trim()
    if (!value || running) return
    void send(value, mode)
    setText('')
    if (mode === 'task') onOpenWorkspace()
  }

  return (
    <div className="agent-home-embedded">
      <section className="agent-home-main">
        <section className={`home-pony-team ${running ? 'working' : ''}`}>
          <div className="home-team-copy">
            <span>{running ? 'TEAM WORKING' : 'DIGITAL TEAM'}</span>
            <strong>{running ? '小马团队正在协作' : '你的小马团队已就位'}</strong>
            <small>{running ? '主 Agent 正在决策与分配任务' : `${Math.max(0, ponies.length - 1)} 位数字员工在线待命`}</small>
          </div>
          <div className="home-pony-lineup">
            {visiblePonies.map((pony) => <HomePony key={pony.id} pony={pony} busy={pony.id === 'leader' ? running : busyPonies.has(pony.id)} />)}
          </div>
          <button type="button" onClick={onOpenWorkspace}>查看工作台 <span>→</span></button>
        </section>

        <section className="agent-chat-card">
          <div className="agent-mode-tabs">
            <button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}><strong>直接咨询</strong><span>主 Agent 即时回答</span></button>
            <button className={mode === 'task' ? 'active' : ''} onClick={() => setMode('task')}><strong>发布任务</strong><span>调用小马协同工作</span></button>
          </div>

          <div className="agent-home-messages" ref={listRef}>
            {historyMessages.length > 0 && (
              <section className={`agent-history-group ${historyOpen ? 'open' : ''}`}>
                <button type="button" onClick={() => setHistoryOpen((open) => !open)}>
                  <span>历史对话</span>
                  <small>{historyMessages.length} 条消息</small>
                  <b>{historyOpen ? '收起' : '展开'}</b>
                </button>
                {historyOpen && <div className="agent-history-list">{historyMessages.map((message) => (
                  <div key={message.id} className={`agent-home-message ${message.role}`}>
                    <span>{message.role === 'user' ? userName.slice(0, 1) : '领'}</span>
                    <div>{message.role === 'leader' ? <MarkdownBody>{message.content}</MarkdownBody> : message.content}</div>
                  </div>
                ))}</div>}
              </section>
            )}
            {currentMessages.length === 0 && !streaming ? (
              <div className="agent-welcome"><span>领</span><div><strong>我是你的主 Agent</strong><p>我可以直接回答问题。遇到需要数据分析、生成报告或调用工具的工作，请切换到“发布任务”。</p></div></div>
            ) : currentMessages.map((message) => (
              <div key={message.id} className={`agent-home-message ${message.role}`}>
                <span>{message.role === 'user' ? userName.slice(0, 1) : '领'}</span>
                <div>{message.role === 'leader' ? <MarkdownBody>{message.content}</MarkdownBody> : message.content}</div>
              </div>
            ))}
            {streaming && <div className="agent-home-message leader"><span>领</span><div><MarkdownBody>{streaming}</MarkdownBody><i className="caret" /></div></div>}
          </div>

          <div className="agent-table-area">
            {activeTables.length > 0 ? (
              <div className="table-chips">
                {activeTables.map((table) => (
                  <span
                    key={table.table}
                    className="chip chip-active"
                    title={table.columns.map((column) => column.name).join('、')}
                  >
                    {table.table.replace(/^data_/, '')} · {table.rowCount} 行
                    <button
                      type="button"
                      className="chip-remove"
                      disabled={running}
                      aria-label={`移出 ${table.table.replace(/^data_/, '')}`}
                      onClick={() => void removeFromActive(table.table)}
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
          </div>

          <SessionBindingChips disabled={running} />

          <div className="agent-composer">
            <div className="agent-composer-field" ref={composerAnchorRef}>
              <textarea
                value={text}
                disabled={running}
                placeholder={
                  mode === 'chat'
                    ? '向主 Agent 提问；输入 / 绑定 Skill 或 MCP，Enter 发送'
                    : '描述任务目标；输入 / 绑定 Skill 或 MCP，Enter 发送'
                }
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (slash.onKeyDown(event)) return
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
            </div>
            <SlashBindMenu slash={slash} disabled={running} anchorRef={composerAnchorRef} />
            <div className="agent-composer-actions">
              <button className="agent-upload" disabled={running} onClick={() => void upload()}>＋ 上传文件</button>
              <button className="agent-upload" disabled={running || tables.length === 0} onClick={() => setPickerOpen(true)}>选择数据</button>
              <span>支持 xlsx、xls、csv、txt · / 绑定能力</span>
              {running ? <button className="agent-submit stop" onClick={() => void cancelRun()}>停止生成</button> : <button className="agent-submit" disabled={!text.trim()} onClick={submit}>{mode === 'chat' ? '发送' : '发布任务 →'}</button>}
            </div>
          </div>

          <DataPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            tables={tables}
            activeTableNames={activeTableNames}
            onConfirm={(names) => void setActiveTables(names)}
          />
        </section>

        <div className="agent-prompt-row">{prompts.map((prompt, index) => <button key={prompt} onClick={() => { setMode(index === 2 ? 'task' : 'chat'); setText(prompt) }}><i>{index === 0 ? '问' : index === 1 ? '思' : '办'}</i><span>{prompt}</span><b>→</b></button>)}</div>
      </section>
    </div>
  )
}

function HomePony({ pony, busy }: { pony: Pony; busy: boolean }): React.JSX.Element {
  const colors = ponyColors[pony.skin.palette]
  return (
    <div className={`home-pony ${busy ? 'busy' : ''}`} title={`${pony.name}：${pony.role}`}>
      <div className="home-pony-bubble">{busy ? '工作中' : '待命'}</div>
      <div className="home-pony-figure" style={{ '--pony-body': colors.body, '--pony-mane': colors.mane } as React.CSSProperties}>
        <i className="pony-ear left" /><i className="pony-ear right" /><i className="pony-mane" /><i className="pony-head"><b /><b /></i><i className="pony-body" /><i className="pony-leg one" /><i className="pony-leg two" /><i className="pony-leg three" /><i className="pony-leg four" /><i className="pony-tail" />
      </div>
      <strong>{pony.name}</strong>
      <small>{pony.id === 'leader' ? '主 Agent' : pony.role}</small>
    </div>
  )
}
