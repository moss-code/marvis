import { useEffect } from 'react'
import { SceneCanvas } from './scene/SceneCanvas'
import { sceneBus } from './scene/sceneBus'
import { ChatDock } from './ui/ChatDock'
import { TaskLog } from './ui/TaskLog'
import { ReportPanel } from './ui/ReportPanel'
import { useAppStore } from './store/appStore'
import { runMockSequence } from './mock/mockRun'
import type { AgentEvent } from '@shared/types'

export function App(): React.JSX.Element {
  const init = useAppStore((s) => s.init)
  const logOpen = useAppStore((s) => s.logOpen)

  useEffect(() => {
    void init()
    const dispatch = (ev: AgentEvent): void => {
      useAppStore.getState().handleEvent(ev)
      sceneBus.director?.handle(ev)
    }
    const off = window.api.onAgentEvent(dispatch)
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__mockRun = () => runMockSequence(dispatch)
    }
    return off
  }, [init])

  return (
    <div className={`app ${logOpen ? 'log-open' : ''}`}>
      <SceneCanvas />
      <header className="titlebar">
        <span className="serif app-title">小马办公室</span>
        <span className="app-tagline">让小马们替你干活</span>
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
    </div>
  )
}
