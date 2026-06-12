import { useEffect, useState } from 'react'
import { SceneCanvas } from './scene/SceneCanvas'
import { sceneBus } from './scene/sceneBus'
import { AudioDirector } from './audio/AudioDirector'
import { ChatDock } from './ui/ChatDock'
import { TaskLog } from './ui/TaskLog'
import { ReportPanel } from './ui/ReportPanel'
import { PonyCard } from './ui/PonyCard'
import { HireForm } from './ui/HireForm'
import { SettingsPanel } from './ui/SettingsPanel'
import { RunHistoryPanel } from './ui/RunHistoryPanel'
import { GovernanceCenter } from './ui/GovernanceCenter'
import { useAppStore } from './store/appStore'
import { runMockSequence } from './mock/mockRun'
import type { AgentEvent } from '@shared/types'
import { LoginPage } from './ui/LoginPage'
import { CommercialDashboard } from './ui/CommercialDashboard'

type AppView = 'login' | 'dashboard' | 'workspace'

export function App(): React.JSX.Element {
  const [view, setView] = useState<AppView>('login')
  const [userName, setUserName] = useState('企业用户')

  if (view === 'login') {
    return <LoginPage onLogin={(name) => { setUserName(name); setView('workspace') }} />
  }

  if (view === 'dashboard') {
    return <CommercialDashboard userName={userName} onOpenWorkspace={() => setView('workspace')} onLogout={() => setView('login')} />
  }

  return <Workspace onBack={() => setView('dashboard')} />
}

function Workspace({ onBack }: { onBack(): void }): React.JSX.Element {
  const init = useAppStore((s) => s.init)
  const logOpen = useAppStore((s) => s.logOpen)
  const openPonyId = useAppStore((s) => s.openPonyId)
  const hiringOpen = useAppStore((s) => s.hiringOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const historyOpen = useAppStore((s) => s.historyOpen)
  const governanceOpen = useAppStore((s) => s.governanceOpen)
  const replaying = useAppStore((s) => s.replaying)
  const ponies = useAppStore((s) => s.ponies)
  const openPony = useAppStore((s) => s.openPony)
  const closePony = useAppStore((s) => s.closePony)
  const openHiring = useAppStore((s) => s.openHiring)
  const closeHiring = useAppStore((s) => s.closeHiring)
  const openSettings = useAppStore((s) => s.openSettings)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const openHistory = useAppStore((s) => s.openHistory)
  const closeHistory = useAppStore((s) => s.closeHistory)
  const openGovernance = useAppStore((s) => s.openGovernance)
  const [soundOn, setSoundOn] = useState(() => AudioDirector.get().isEnabled())

  const selectedPony = ponies.find((p) => p.id === openPonyId)

  useEffect(() => {
    void init()
    const audio = AudioDirector.get()
    const dispatch = (ev: AgentEvent): void => {
      if (!useAppStore.getState().replaying) {
        useAppStore.getState().handleEvent(ev)
      }
      sceneBus.director?.handle(ev)
      audio.handle(ev)
    }
    const off = window.api.onAgentEvent(dispatch)
    const offApproval = window.api.onApprovalRequired((request) => {
      useAppStore.getState().handleApprovalRequired(request)
    })
    sceneBus.onPonyClick = (id) => openPony(id)
    sceneBus.onHireClick = () => {
      if (useAppStore.getState().ponies.length < 6) openHiring()
    }
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__mockRun = () => runMockSequence(dispatch)
    }
    return () => {
      off()
      offApproval()
      sceneBus.onPonyClick = null
      sceneBus.onHireClick = null
    }
  }, [init, openPony, openHiring])

  return (
    <div className={`app ${logOpen ? 'log-open' : ''}`}>
      <SceneCanvas />
      <header className="titlebar">
        <button className="btn btn-ghost workspace-back" onClick={onBack}>← 企业控制台</button>
        <span className="serif app-title">任务工作台</span>
        <span className="app-tagline">数字员工实时协作空间</span>
        <button className="btn btn-ghost btn-history" onClick={() => openHistory()}>
          任务历史
        </button>
        <button className="btn btn-ghost btn-governance" onClick={() => openGovernance()}>
          治理中心
        </button>
        <button className="btn btn-ghost btn-settings" onClick={() => openSettings()}>
          设置
        </button>
        <button
          className="btn btn-ghost btn-sound"
          title={soundOn ? '关闭音效' : '开启音效'}
          onClick={() => setSoundOn(AudioDirector.get().toggle())}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        {import.meta.env.DEV && (
          <button
            className="btn btn-ghost btn-mock"
            onClick={() => {
              const fn = (window as unknown as Record<string, unknown>).__mockRun
              if (typeof fn === 'function') void (fn as () => Promise<void>)()
            }}
          >
            动画演示
          </button>
        )}
      </header>
      <TaskLog />
      <ChatDock />
      <ReportPanel />
      {selectedPony && <PonyCard pony={selectedPony} onClose={closePony} />}
      {hiringOpen && (
        <HireForm
          onClose={closeHiring}
          onHired={() => {
            /* 入场动画由 SceneCanvas 监听 ponies 变化触发 */
          }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel key="settings" onClose={closeSettings} />
      )}
      {historyOpen && <RunHistoryPanel onClose={closeHistory} />}
      {governanceOpen && <GovernanceCenter />}
      {replaying && <div className="replay-badge">回放 ▶</div>}
    </div>
  )
}
