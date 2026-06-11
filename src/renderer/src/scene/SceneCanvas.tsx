import { useEffect, useRef } from 'react'
import { OfficeScene } from './OfficeScene'
import { SceneDirector } from './SceneDirector'
import { sceneBus } from './sceneBus'
import { useAppStore } from '@/store/appStore'
import type { Pony } from '@shared/types'

const PRESET_ORDER = ['leader', 'data', 'report', 'file', 'writer']

function deskIndexFor(pony: Pony): number {
  const presetIdx = PRESET_ORDER.indexOf(pony.id)
  if (presetIdx >= 0) return presetIdx
  return 5
}

/** Pixi 画布宿主：挂载办公室场景并入驻小马 */
export function SceneCanvas(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const ponies = useAppStore((s) => s.ponies)
  const sceneRef = useRef<OfficeScene | null>(null)
  const mountedIds = useRef<Set<string>>(new Set())
  const prevPonies = useRef<Pony[]>([])

  useEffect(() => {
    let disposed = false
    if (!hostRef.current) return
    OfficeScene.create(hostRef.current).then((scene) => {
      if (disposed) {
        scene.destroy()
        return
      }
      sceneRef.current = scene
      sceneBus.scene = scene
      sceneBus.director = new SceneDirector(scene)
      scene.onWhiteboardClick = () => {
        const { reports, openReport, replaying } = useAppStore.getState()
        if (replaying && sceneBus.replayReportId) {
          void window.api.getReport(sceneBus.replayReportId).then((r) => {
            if (r) openReport(sceneBus.replayReportId!)
            else window.alert('该报告已删除')
          })
          return
        }
        if (reports.length > 0) openReport(reports[0].id)
      }
      scene.onPonyClick = (id) => sceneBus.onPonyClick?.(id)
      scene.onHireClick = () => sceneBus.onHireClick?.()
      // 场景异步就绪时须读 store 最新值，避免闭包里的 ponies 仍为 []
      void syncRoster(scene, useAppStore.getState().ponies, true)
    })
    return () => {
      disposed = true
      mountedIds.current.clear()
      prevPonies.current = []
      sceneBus.director = null
      sceneBus.scene = null
      sceneRef.current?.destroy()
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    void syncRoster(scene, ponies, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ponies])

  async function syncRoster(scene: OfficeScene, roster: Pony[], initial: boolean): Promise<void> {
    const customCount = roster.filter((p) => !PRESET_ORDER.includes(p.id)).length
    scene.setHireSlotVisible(roster.length < 6 && customCount === 0)

    const prev = prevPonies.current
    const prevIds = new Set(prev.map((p) => p.id))
    const nextIds = new Set(roster.map((p) => p.id))

    for (const id of prevIds) {
      if (!nextIds.has(id) && mountedIds.current.has(id)) {
        mountedIds.current.delete(id)
        if (!initial) await scene.playDismissal(id)
        else scene.removePony(id)
      }
    }

    for (const pony of roster) {
      const idx = deskIndexFor(pony)
      if (!mountedIds.current.has(pony.id)) {
        if (initial) {
          scene.addPony(pony, idx)
          mountedIds.current.add(pony.id)
        } else if (!prevIds.has(pony.id)) {
          mountedIds.current.add(pony.id)
          const isCustomNew = !PRESET_ORDER.includes(pony.id)
          if (isCustomNew) {
            scene.setHireSlotVisible(false)
            await scene.playEntrance(pony, idx)
          } else {
            scene.addPony(pony, idx)
          }
        }
      } else {
        const old = prev.find((p) => p.id === pony.id)
        if (old && (old.name !== pony.name || JSON.stringify(old.skin) !== JSON.stringify(pony.skin))) {
          scene.updatePony(pony.id, pony)
        }
      }
    }

    prevPonies.current = roster
  }

  return <div ref={hostRef} className="scene-host" />
}
