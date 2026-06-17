import { useAppStore } from '@/store/appStore'
import { WorkflowView } from '@/ui/WorkflowView'

/** 右侧工作流面板（替代原任务日志） */
export function WorkflowDock(): React.JSX.Element {
  const events = useAppStore((s) => (s.replaying ? s.replayEvents : s.events))

  return (
    <section className="workspace-dock workflow-dock panel">
      <header className="workspace-dock-head">
        <h3 className="serif">工作流</h3>
        <small>{events.length > 0 ? `${events.length} 事件` : '等待任务'}</small>
      </header>
      <div className="workspace-dock-body">
        <WorkflowView events={events} variant="dock" />
      </div>
    </section>
  )
}
