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
import type { AgentEvent, PonyId } from '@shared/types'
import { filterPoniesBySolutionRoster } from '@shared/solutionRoster'
import { OFFICE_CAPACITY, isOfficeRosterFull } from '@shared/office'
import type { IdleVariant } from './scene/PonyActor'
import { LoginPage } from './ui/LoginPage'
import { CommercialDashboard } from './ui/CommercialDashboard'
import { DialogHost } from './ui/DialogHost'
import { showAppAlert } from '@/store/dialogStore'

type AppView = 'login' | 'dashboard' | 'workspace'

/** 自动化任务在后台执行，不进入对话框、场景动画与音效 */
const automationRunIds = new Set<string>()

function isAutomationUiEvent(ev: AgentEvent): boolean {
  if (ev.type === 'run_started' && ev.trigger === 'automation') {
    automationRunIds.add(ev.runId)
    return true
  }
  const runId = 'runId' in ev ? ev.runId : undefined
  if (runId && automationRunIds.has(runId)) {
    if (ev.type === 'run_finished') automationRunIds.delete(runId)
    return true
  }
  return false
}

export function App(): React.JSX.Element {
  const [view, setView] = useState<AppView>('login')
  const [userName, setUserName] = useState('企业用户')
  const [openDashboardPreferences, setOpenDashboardPreferences] = useState(false)

  if (view === 'login') {
    return (
      <>
        <LoginPage onLogin={(name) => { setUserName(name); setView('dashboard') }} />
        <DialogHost />
      </>
    )
  }

  return (
    <>
      <AuthenticatedApp view={view} userName={userName} setView={setView} openDashboardPreferences={openDashboardPreferences} setOpenDashboardPreferences={setOpenDashboardPreferences} />
      <DialogHost />
    </>
  )
}

function AuthenticatedApp({ view, userName, setView, openDashboardPreferences, setOpenDashboardPreferences }: { view: Exclude<AppView, 'login'>; userName: string; setView(view: AppView): void; openDashboardPreferences: boolean; setOpenDashboardPreferences(open: boolean): void }): React.JSX.Element {
  const init = useAppStore((s) => s.init)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    void init().then(() => { if (active) setReady(true) })
    const audio = AudioDirector.get()
    const dispatch = (ev: AgentEvent): void => {
      if (isAutomationUiEvent(ev)) return
      if (!useAppStore.getState().replaying) useAppStore.getState().handleEvent(ev)
      sceneBus.director?.handle(ev)
      audio.handle(ev)
    }
    const off = window.api.onAgentEvent(dispatch)
    const offApproval = window.api.onApprovalRequired((request) => {
      useAppStore.getState().handleApprovalRequired(request)
    })
    return () => { active = false; off(); offApproval() }
  }, [init])

  if (!ready) return <div className="app-loading">正在准备智能工作空间…</div>

  if (view === 'dashboard') {
    return (
      <CommercialDashboard
        userName={userName}
        openPreferences={openDashboardPreferences}
        onPreferencesOpened={() => setOpenDashboardPreferences(false)}
        onOpenWorkspace={() => setView('workspace')}
        onEnterWorkspace={(solutionId) => {
          const solution = useAppStore.getState().solutions.find((s) => s.id === solutionId)
          useAppStore.getState().setActiveSolution(solutionId, solution?.defaultTaskTemplate ?? null)
          setView('workspace')
        }}
        onLogout={() => setView('login')}
      />
    )
  }

  return <Workspace onBack={() => setView('dashboard')} />
}

function Workspace({ onBack }: { onBack(): void }): React.JSX.Element {
  const [chatDockWidth, setChatDockWidth] = useState(508)
  const logOpen = useAppStore((s) => s.logOpen)
  const openLog = useAppStore((s) => s.openLog)
  const closeLog = useAppStore((s) => s.closeLog)
  const openPonyId = useAppStore((s) => s.openPonyId)
  const hiringOpen = useAppStore((s) => s.hiringOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const historyOpen = useAppStore((s) => s.historyOpen)
  const governanceOpen = useAppStore((s) => s.governanceOpen)
  const replaying = useAppStore((s) => s.replaying)
  const ponies = useAppStore((s) => s.ponies)
  const solutions = useAppStore((s) => s.solutions)
  const activeSolutionId = useAppStore((s) => s.activeSolutionId)
  const activeSolution = solutions.find((s) => s.id === activeSolutionId)
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

  const rosterPonies = filterPoniesBySolutionRoster(ponies, activeSolution)
  const selectedPony = rosterPonies.find((p) => p.id === openPonyId)

  useEffect(() => {
    if (openPonyId && !rosterPonies.some((p) => p.id === openPonyId)) {
      closePony()
    }
  }, [openPonyId, rosterPonies, closePony])

  useEffect(() => {
    sceneBus.onPonyClick = (id) => openPony(id)
    sceneBus.onHireClick = () => {
      const state = useAppStore.getState()
      const solution = state.solutions.find((s) => s.id === state.activeSolutionId)
      const rosterIds = solution?.ponyIds ?? []
      if (isOfficeRosterFull(rosterIds)) {
        void showAppAlert(
          `本方案办公室已满员（最多 ${OFFICE_CAPACITY} 名数字员工）。请先从编制中移除其他马，或在「数字员工中心」管理档案后通过方案配置调入。`
        )
        return
      }
      openHiring()
    }
    sceneBus.onLogClick = () => openLog()
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__mockRun = () => runMockSequence((ev) => {
        useAppStore.getState().handleEvent(ev)
        sceneBus.director?.handle(ev)
        AudioDirector.get().handle(ev)
      })
      ;(window as unknown as Record<string, unknown>).__forceIdleVariant = (
        variant: IdleVariant,
        ponyId: PonyId = 'data'
      ) => {
        sceneBus.scene?.getActor(ponyId)?.debugPlayIdleVariant(variant)
      }
    }
    return () => {
      sceneBus.onPonyClick = null
      sceneBus.onHireClick = null
      sceneBus.onLogClick = null
    }
  }, [openPony, openHiring, openLog])

  return (
    <div className="app">
      <SceneCanvas reservedRightWidth={chatDockWidth} />
      <header className="titlebar">
        <button className="btn btn-ghost workspace-back" onClick={onBack}>← 企业控制台</button>
        <span className="serif app-title">任务工作台</span>
        {activeSolution ? (
          <span className="solution-title-badge" title={activeSolution.desc}>
            {activeSolution.title}
          </span>
        ) : (
          <span className="app-tagline">数字员工实时协作空间</span>
        )}
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
      <ChatDock onWidthChange={setChatDockWidth} />
      {logOpen && <TaskLog onClose={closeLog} />}
      <ReportPanel />
      {selectedPony && (
        <PonyCard
          pony={selectedPony}
          onClose={closePony}
          solutionContext={{ solutionId: activeSolutionId }}
        />
      )}
      {hiringOpen && (
        <HireForm
          solutionId={activeSolutionId}
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
