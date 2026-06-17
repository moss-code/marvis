import { useEffect, useState } from 'react'
import { SceneCanvas } from '@/scene/SceneCanvas'
import { sceneBus } from '@/scene/sceneBus'
import { AudioDirector } from '@/audio/AudioDirector'
import { WorkspaceRightRail } from '@/ui/WorkspaceRightRail'
import { WorkspaceTopbar } from '@/ui/WorkspaceTopbar'
import { PonyCard } from '@/ui/PonyCard'
import { HireForm } from '@/ui/HireForm'
import { SettingsPanel } from '@/ui/SettingsPanel'
import { RunHistoryPanel } from '@/ui/RunHistoryPanel'
import { GovernanceCenter } from '@/ui/GovernanceCenter'
import { ReportPanel } from '@/ui/ReportPanel'
import { useAppStore } from '@/store/appStore'
import { runMockSequence } from '@/mock/mockRun'
import type { PonyId, Solution } from '@shared/types'
import { filterPoniesBySolutionRoster } from '@shared/solutionRoster'
import { OFFICE_CAPACITY, isOfficeRosterFull } from '@shared/office'
import type { IdleVariant } from '@/scene/PonyActor'
import { showAppAlert } from '@/store/dialogStore'

const DEFAULT_RAIL_WIDTH = 380
const MIN_RAIL_WIDTH = 300
const MAX_RAIL_WIDTH = 520

interface WorkspaceEmbeddedProps {
  userName: string
  activeSolution?: Solution
  accountMenuOpen: boolean
  setAccountMenuOpen(open: boolean): void
  onLogout(): void
  openPanel(kind: 'notifications' | 'profile' | 'tenant-settings' | 'account-security' | 'preferences'): void
}

export function WorkspaceEmbedded({
  userName,
  activeSolution,
  accountMenuOpen,
  setAccountMenuOpen,
  onLogout,
  openPanel
}: WorkspaceEmbeddedProps): React.JSX.Element {
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH)
  const openPonyId = useAppStore((s) => s.openPonyId)
  const hiringOpen = useAppStore((s) => s.hiringOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const historyOpen = useAppStore((s) => s.historyOpen)
  const governanceOpen = useAppStore((s) => s.governanceOpen)
  const replaying = useAppStore((s) => s.replaying)
  const ponies = useAppStore((s) => s.ponies)
  const activeSolutionId = useAppStore((s) => s.activeSolutionId)
  const openPony = useAppStore((s) => s.openPony)
  const closePony = useAppStore((s) => s.closePony)
  const openHiring = useAppStore((s) => s.openHiring)
  const closeHiring = useAppStore((s) => s.closeHiring)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const closeHistory = useAppStore((s) => s.closeHistory)

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
    sceneBus.onLogClick = null
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__mockRun = () =>
        runMockSequence((ev) => {
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
  }, [openPony, openHiring])

  return (
    <div className="workspace-embedded">
      <div
        className="workspace-body"
        style={{ ['--workspace-rail-width' as string]: `${railWidth}px` }}
      >
        <div className="workspace-scene-column">
          <WorkspaceTopbar
            userName={userName}
            activeSolution={activeSolution}
            accountMenuOpen={accountMenuOpen}
            setAccountMenuOpen={setAccountMenuOpen}
            onLogout={onLogout}
            openPanel={openPanel}
          />
          <div className="workspace-scene-frame">
            <div className="workspace-scene">
              <SceneCanvas reservedRightWidth={0} layoutMode="embedded" />
            </div>
          </div>
        </div>
        <WorkspaceRightRail
          minWidth={MIN_RAIL_WIDTH}
          maxWidth={MAX_RAIL_WIDTH}
          width={railWidth}
          onWidthChange={setRailWidth}
        />
      </div>

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
      {settingsOpen && <SettingsPanel key="settings" onClose={closeSettings} />}
      {historyOpen && <RunHistoryPanel onClose={closeHistory} />}
      {governanceOpen && <GovernanceCenter />}
      <ReportPanel />
      {replaying && <div className="replay-badge">回放 ▶</div>}
    </div>
  )
}
