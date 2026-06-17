import { useEffect, useState } from 'react'
import { sceneBus } from './scene/sceneBus'
import { AudioDirector } from './audio/AudioDirector'
import { useAppStore } from './store/appStore'
import type { AgentEvent } from '@shared/types'
import { LoginPage } from './ui/LoginPage'
import { CommercialDashboard } from './ui/CommercialDashboard'
import { DialogHost } from './ui/DialogHost'

type AppView = 'login' | 'dashboard'

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
      <AuthenticatedApp userName={userName} setView={setView} openDashboardPreferences={openDashboardPreferences} setOpenDashboardPreferences={setOpenDashboardPreferences} />
      <DialogHost />
    </>
  )
}

function AuthenticatedApp({
  userName,
  setView,
  openDashboardPreferences,
  setOpenDashboardPreferences
}: {
  userName: string
  setView(view: AppView): void
  openDashboardPreferences: boolean
  setOpenDashboardPreferences(open: boolean): void
}): React.JSX.Element {
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

  return (
    <CommercialDashboard
      userName={userName}
      openPreferences={openDashboardPreferences}
      onPreferencesOpened={() => setOpenDashboardPreferences(false)}
      onLogout={() => setView('login')}
    />
  )
}
