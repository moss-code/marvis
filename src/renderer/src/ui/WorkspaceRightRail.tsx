import { ChatDock } from '@/ui/ChatDock'
import { WorkflowDock } from '@/ui/WorkflowDock'
import { ReportDock } from '@/ui/ReportDock'

interface Props {
  width: number
  minWidth: number
  maxWidth: number
  onWidthChange(width: number): void
}

export function WorkspaceRightRail({ width, minWidth, maxWidth, onWidthChange }: Props): React.JSX.Element {
  const startResize = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width

    const onMove = (moveEvent: PointerEvent): void => {
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth - (moveEvent.clientX - startX)))
      onWidthChange(next)
    }

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  return (
    <aside className="workspace-right-rail">
      <button
        type="button"
        className="panel-resize-handle panel-resize-handle-left workspace-rail-resize"
        aria-label="调整右侧栏宽度"
        title="拖拽调整宽度"
        onPointerDown={startResize}
      />
      <div className="workspace-rail-slot workspace-rail-slot-chat">
        <ChatDock mode="rail" />
      </div>
      <div className="workspace-rail-slot workspace-rail-slot-workflow">
        <WorkflowDock />
      </div>
      <div className="workspace-rail-slot workspace-rail-slot-report">
        <ReportDock />
      </div>
    </aside>
  )
}
