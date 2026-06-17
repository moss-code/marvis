import { useEffect, useRef, useState } from 'react'
import type { AutomationJob } from '@shared/types'
import { formatScheduleShort, runtimeStatusText } from '@shared/automationDisplay'
import { AutomationClockIcon } from '@/ui/automation/AutomationIcons'

interface AutomationJobCardProps {
  job: AutomationJob
  onEdit(): void
  onToggle(): void
  onRunNow(): void
  onDelete(): void
}

export function AutomationJobCard({
  job,
  onEdit,
  onToggle,
  onRunNow,
  onDelete
}: AutomationJobCardProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const status = runtimeStatusText(job)
  const statusClass =
    job.runtimeStatus === 'running'
      ? 'running'
      : job.runtimeStatus === 'waiting'
        ? 'waiting'
        : !job.enabled
          ? 'paused'
          : job.lastStatus === 'failed'
            ? 'failed'
            : 'idle'

  return (
    <article className={`automation-job-card${job.enabled ? '' : ' paused'}`}>
      <div className="automation-job-card-head">
        <span className="automation-job-icon" aria-hidden="true">
          <AutomationClockIcon />
        </span>
        <div className="automation-job-card-title">
          <strong>{job.name}</strong>
          <span className={`automation-job-status ${statusClass}`}>{status}</span>
        </div>
      </div>
      <p className="automation-job-desc">{job.prompt.trim()}</p>
      <footer className="automation-job-card-foot">
        <span className="automation-job-schedule">{formatScheduleShort(job.schedule)}</span>
        <div className="automation-job-card-actions">
          <button type="button" className="automation-job-view" onClick={onEdit}>
            查看
          </button>
          <div className="automation-job-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="automation-job-menu-btn"
              aria-label="更多操作"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="automation-job-menu">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onRunNow()
                  }}
                >
                  立即运行
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit()
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onToggle()
                  }}
                >
                  {job.enabled ? '暂停' : '启用'}
                </button>
                <button type="button" className="danger" onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}>
                  删除
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </article>
  )
}
