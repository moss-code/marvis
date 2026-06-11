import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { MarkdownBody } from '@/ui/MarkdownBody'
import type { PaletteId, Pony, PonyId } from '@shared/types'

interface HomePageProps {
  userName: string
  onOpenWorkspace(): void
  onOpenDashboard(): void
  onOpenPreferences(): void
  onLogout(): void
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

export function HomePage({ userName, onOpenWorkspace, onOpenDashboard, onOpenPreferences, onLogout }: HomePageProps): React.JSX.Element {
  const { chat, streaming, running, currentRunId, events, ponies, tables, activeTableNames, send, upload, cancelRun } = useAppStore()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'chat' | 'task'>('chat')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [historyCount] = useState(chat.length)
  const listRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat, streaming])

  const submit = (): void => {
    const value = text.trim()
    if (!value || running) return
    void send(value, mode)
    setText('')
    if (mode === 'task') onOpenWorkspace()
  }

  return (
    <main className="agent-home">
      <header className="agent-home-header">
        <div className="agent-home-brand"><span>翼</span><div><strong>翼智小马</strong><small>企业智能工作入口</small></div></div>
        <nav>
          <button className="active">智能首页</button>
          <button onClick={onOpenWorkspace}>任务工作台</button>
          <button onClick={onOpenDashboard}>企业控制台</button>
        </nav>
        <div className="account-menu-wrap agent-home-account">
          <button className={accountMenuOpen ? 'user-menu active' : 'user-menu'} onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>
            <span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>企业管理员</small></div><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
          </button>
          {accountMenuOpen && <div className="account-dropdown">
            <div className="account-dropdown-head"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>demo@wingai.cn</small></div></div>
            <div className="account-dropdown-section">
              <button onClick={onOpenDashboard}><i>人</i><span><strong>个人资料</strong><small>姓名、联系方式与头像</small></span></button>
              <button onClick={onOpenDashboard}><i>企</i><span><strong>企业信息</strong><small>租户资料与成员权限</small></span></button>
              <button onClick={onOpenDashboard}><i>锁</i><span><strong>账号安全</strong><small>密码、登录与身份认证</small></span></button>
              <button onClick={onOpenPreferences}><i>偏</i><span><strong>偏好设置</strong><small>通知、语言与全局外观</small></span></button>
            </div>
            <div className="account-dropdown-footer"><button onClick={onLogout}><i>退</i><span>退出当前账号</span></button></div>
          </div>}
        </div>
      </header>

      <section className="agent-home-main">
        <div className="agent-home-intro">
          <span className="eyebrow">MAIN AGENT</span>
          <h1>你好，{userName}<br />今天想让小马们做什么？</h1>
          <p>直接向主 Agent 提问获得回答，或上传业务文件并发布任务，由任务工作台中的数字员工协同执行。</p>
        </div>

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

          {activeTables.length > 0 && <div className="agent-file-strip">{activeTables.map((table) => <span key={table.table}>▤ {table.table.replace(/^data_/, '')}<small>{table.rowCount} 行</small></span>)}</div>}

          <div className="agent-composer">
            <textarea value={text} disabled={running} placeholder={mode === 'chat' ? '向主 Agent 提问，Enter 发送，Shift + Enter 换行' : '描述任务目标，主 Agent 会安排合适的小马执行'} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit() } }} />
            <div className="agent-composer-actions">
              <button className="agent-upload" disabled={running} onClick={() => void upload()}>＋ 上传文件</button>
              <span>支持 xlsx、xls、csv、txt</span>
              {running ? <button className="agent-submit stop" onClick={() => void cancelRun()}>停止生成</button> : <button className="agent-submit" disabled={!text.trim()} onClick={submit}>{mode === 'chat' ? '发送' : '发布任务 →'}</button>}
            </div>
          </div>
        </section>

        <div className="agent-prompt-row">{prompts.map((prompt, index) => <button key={prompt} onClick={() => { setMode(index === 2 ? 'task' : 'chat'); setText(prompt) }}><i>{index === 0 ? '问' : index === 1 ? '思' : '办'}</i><span>{prompt}</span><b>→</b></button>)}</div>
      </section>
    </main>
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
