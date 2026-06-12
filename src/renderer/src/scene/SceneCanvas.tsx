import { useEffect, useRef, useState } from 'react'

import { OfficeScene } from './OfficeScene'

import { SceneDirector } from './SceneDirector'

import { sceneBus } from './sceneBus'

import { useAppStore } from '@/store/appStore'

import { WhiteboardPreview } from '@/ui/WhiteboardPreview'

import type { Pony } from '@shared/types'

import {

  collectOccupiedDesks,

  deskIndexForPony,

  firstEmptyCustomDesk,

  isPresetPony,

  OFFICE_CAPACITY

} from '@shared/office'



/** Pixi 画布宿主：挂载办公室场景并入驻小马 */

export function SceneCanvas(): React.JSX.Element {

  const hostRef = useRef<HTMLDivElement>(null)

  const ponies = useAppStore((s) => s.ponies)

  const sceneRef = useRef<OfficeScene | null>(null)

  const [sceneReady, setSceneReady] = useState<OfficeScene | null>(null)

  const mountedIds = useRef<Set<string>>(new Set())

  const prevPonies = useRef<Pony[]>([])

  const syncQueue = useRef<Promise<void>>(Promise.resolve())

  const sessionRef = useRef(0)



  useEffect(() => {

    const session = ++sessionRef.current

    let disposed = false

    const alive = (): boolean => !disposed && session === sessionRef.current



    if (!hostRef.current) return



    void OfficeScene.create(hostRef.current).then((scene) => {

      if (!alive()) {

        scene.destroy()

        return

      }

      sceneRef.current = scene

      setSceneReady(scene)

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

      scene.onLogClick = () => sceneBus.onLogClick?.()

      syncQueue.current = syncQueue.current.then(() =>

        syncRoster(scene, useAppStore.getState().ponies, true, alive)

      )

    })



    return () => {

      disposed = true

      sessionRef.current++

      syncQueue.current = Promise.resolve()

      mountedIds.current.clear()

      prevPonies.current = []

      sceneBus.director = null

      sceneBus.scene = null

      sceneRef.current?.destroy()

      sceneRef.current = null

      setSceneReady(null)

    }

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [])



  useEffect(() => {

    const scene = sceneRef.current

    if (!scene) return

    const session = sessionRef.current

    const alive = (): boolean => session === sessionRef.current && !scene.isDestroyed

    syncQueue.current = syncQueue.current

      .then(() => syncRoster(scene, ponies, false, alive))

      .catch((err) => console.error('[SceneCanvas] syncRoster', err))

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [ponies, sceneReady])



  async function syncRoster(

    scene: OfficeScene,

    roster: Pony[],

    initial: boolean,

    alive: () => boolean

  ): Promise<void> {

    if (!alive() || scene.isDestroyed) return



    scene.setHireAvailable(roster.length < OFFICE_CAPACITY)



    const prev = prevPonies.current

    const prevIds = new Set(prev.map((p) => p.id))

    const nextIds = new Set(roster.map((p) => p.id))



    for (const id of prevIds) {

      if (!alive() || scene.isDestroyed) return

      if (!nextIds.has(id) && mountedIds.current.has(id)) {

        mountedIds.current.delete(id)

        if (!initial) {

          void scene.playDismissal(id).catch((err) => console.error('[SceneCanvas] dismissal', err))

        } else {

          scene.removePony(id)

        }

      }

    }



    if (!alive() || scene.isDestroyed) return



    const mountedDesks = new Map<string, number>()

    for (const id of mountedIds.current) {

      const desk = scene.getPonyDeskIndex(id)

      if (desk != null) mountedDesks.set(id, desk)

    }



    for (const pony of roster) {

      if (!alive() || scene.isDestroyed) return

      if (!mountedIds.current.has(pony.id)) {

        if (initial) {

          const idx = deskIndexForPony(pony, roster)

          scene.addPony(pony, idx)

          mountedIds.current.add(pony.id)

        } else if (!prevIds.has(pony.id)) {

          const idx = isPresetPony(pony.id)

            ? deskIndexForPony(pony, roster)

            : firstEmptyCustomDesk(collectOccupiedDesks(roster, mountedDesks))

          mountedIds.current.add(pony.id)

          mountedDesks.set(pony.id, idx)

          if (!isPresetPony(pony.id)) {

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



    if (!alive() || scene.isDestroyed) return



    scene.setHireAvailable(roster.length < OFFICE_CAPACITY)

    prevPonies.current = roster

  }



  return (

    <div className="scene-host-wrap">

      <div ref={hostRef} className="scene-host" />

      <WhiteboardPreview scene={sceneReady} />

    </div>
  )
}
