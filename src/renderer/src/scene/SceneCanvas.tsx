import { useEffect, useRef, useState, useMemo, type Dispatch, type SetStateAction } from 'react'

import { OfficeScene } from './OfficeScene'

import { SceneDirector } from './SceneDirector'

import { sceneBus } from './sceneBus'

import { useAppStore } from '@/store/appStore'
import { showAppAlert } from '@/store/dialogStore'

import { WhiteboardPreview } from '@/ui/WhiteboardPreview'
import { WorkflowPanel } from '@/ui/WorkflowPanel'

import type { Pony } from '@shared/types'

import { filterPoniesBySolutionRoster } from '@shared/solutionRoster'

import {

  collectOccupiedDesks,

  deskIndexForPony,

  firstEmptyCustomDesk,

  isPresetPony,

  OFFICE_CAPACITY

} from '@shared/office'

const MIN_BOARD_SCALE = 0.8
const MAX_BOARD_SCALE = 2.1

interface BoardRect {
  x: number
  y: number
  width: number
  height: number
}

type BoardKind = 'whiteboard' | 'log'

interface BoardSize {
  scaleX: number
  scaleY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}



/** Pixi 画布宿主：挂载办公室场景并入驻小马 */

export function SceneCanvas({ reservedRightWidth }: { reservedRightWidth: number }): React.JSX.Element {

  const hostRef = useRef<HTMLDivElement>(null)

  const ponies = useAppStore((s) => s.ponies)
  const activeSolutionId = useAppStore((s) => s.activeSolutionId)
  const solutions = useAppStore((s) => s.solutions)
  const activeSolution = solutions.find((s) => s.id === activeSolutionId)
  const rosterPonies = useMemo(
    () => filterPoniesBySolutionRoster(ponies, activeSolution),
    [ponies, activeSolution]
  )
  const taskActive = useAppStore((s) => s.running || s.replaying)

  const sceneRef = useRef<OfficeScene | null>(null)

  const [sceneReady, setSceneReady] = useState<OfficeScene | null>(null)
  const [whiteboardSize, setWhiteboardSize] = useState<BoardSize>({ scaleX: 1, scaleY: 1 })
  const [logBoardSize, setLogBoardSize] = useState<BoardSize>({ scaleX: 1, scaleY: 1 })
  const [whiteboardRect, setWhiteboardRect] = useState<BoardRect | null>(null)
  const [logBoardRect, setLogBoardRect] = useState<BoardRect | null>(null)

  const mountedIds = useRef<Set<string>>(new Set())

  const prevPonies = useRef<Pony[]>([])

  const syncQueue = useRef<Promise<void>>(Promise.resolve())

  const sessionRef = useRef(0)

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setRightReserve(reservedRightWidth)
  }, [reservedRightWidth])

  useEffect(() => {
    sceneRef.current?.setTaskActive(taskActive)
  }, [taskActive, sceneReady])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setWhiteboardSize(whiteboardSize.scaleX, whiteboardSize.scaleY)
  }, [whiteboardSize])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.setLogBoardSize(logBoardSize.scaleX, logBoardSize.scaleY)
  }, [logBoardSize])

  useEffect(() => {
    if (!sceneReady) return
    const updateRects = (): void => {
      setWhiteboardRect(sceneReady.getWhiteboardFrameRect())
      setLogBoardRect(sceneReady.getLogBoardFrameRect())
    }
    const offLayout = sceneReady.addLayoutListener(updateRects)
    updateRects()
    window.addEventListener('resize', updateRects)
    return () => {
      offLayout()
      window.removeEventListener('resize', updateRects)
    }
  }, [sceneReady])



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

      scene.setRightReserve(reservedRightWidth)
      scene.setWhiteboardSize(whiteboardSize.scaleX, whiteboardSize.scaleY)
      scene.setLogBoardSize(logBoardSize.scaleX, logBoardSize.scaleY)
      sceneRef.current = scene

      setSceneReady(scene)

      sceneBus.scene = scene

      sceneBus.director = new SceneDirector(scene)

      scene.onWhiteboardClick = () => {

        const { reports, openReport, replaying } = useAppStore.getState()

        if (replaying && sceneBus.replayReportId) {

          void window.api.getReport(sceneBus.replayReportId).then((r) => {

            if (r) openReport(sceneBus.replayReportId!)

            else void showAppAlert('该报告已删除')

          })

          return

        }

        if (reports.length > 0) openReport(reports[0].id)

      }

      scene.onPonyClick = (id) => sceneBus.onPonyClick?.(id)

      scene.onHireClick = () => sceneBus.onHireClick?.()

      scene.onLogClick = () => sceneBus.onLogClick?.()

      syncQueue.current = syncQueue.current.then(() => {
        const state = useAppStore.getState()
        const solution = state.solutions.find((s) => s.id === state.activeSolutionId)
        const roster = filterPoniesBySolutionRoster(state.ponies, solution)
        return syncRoster(scene, roster, true, alive)
      })

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

      .then(() => syncRoster(scene, rosterPonies, false, alive))

      .catch((err) => console.error('[SceneCanvas] syncRoster', err))

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [ponies, rosterPonies, sceneReady, activeSolutionId])



  async function syncRoster(

    scene: OfficeScene,

    roster: Pony[],

    initial: boolean,

    alive: () => boolean

  ): Promise<void> {

    if (!alive() || scene.isDestroyed) return

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

  const startBoardResize =
    (
      kind: BoardKind,
      handle: 'left' | 'bottom' | 'corner',
      rect: BoardRect | null,
      currentSize: BoardSize,
      setSize: Dispatch<SetStateAction<BoardSize>>
    ) =>
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (!rect) return
      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startY = event.clientY
      const startSize = currentSize

      const onMove = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        const ratioX = dx / Math.max(rect.width, 1)
        const ratioY = dy / Math.max(rect.height, 1)
        const nextSize: BoardSize = {
          scaleX:
            handle === 'bottom'
              ? startSize.scaleX
              : Number(
                  clamp(
                    startSize.scaleX * (1 + (handle === 'left' ? -ratioX : ratioX)),
                    MIN_BOARD_SCALE,
                    MAX_BOARD_SCALE
                  ).toFixed(3)
                ),
          scaleY:
            handle === 'left'
              ? startSize.scaleY
              : Number(
                  clamp(startSize.scaleY * (1 + ratioY), MIN_BOARD_SCALE, MAX_BOARD_SCALE).toFixed(3)
                )
        }
        sceneRef.current?.resizeBoardFromHandle(kind, nextSize.scaleX, nextSize.scaleY, handle)
        setSize(sceneRef.current?.getBoardSize(kind) ?? nextSize)
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    }

  const startBoardMove =
    (kind: BoardKind) =>
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      event.preventDefault()
      event.stopPropagation()

      let lastX = event.clientX
      let lastY = event.clientY

      const onMove = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - lastX
        const dy = moveEvent.clientY - lastY
        lastX = moveEvent.clientX
        lastY = moveEvent.clientY
        sceneRef.current?.moveBoard(kind, dx, dy)
      }

      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    }

  const renderBoardHandles = (
    kind: BoardKind,
    label: string,
    rect: BoardRect | null,
    size: BoardSize,
    setSize: Dispatch<SetStateAction<BoardSize>>
  ): React.JSX.Element | null => {
    if (!rect) return null

    return (
      <div
        className="scene-resize-anchor"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height
        }}
      >
        <button
          type="button"
          className="scene-board-move-handle"
          aria-label={`拖动${label}位置`}
          title={`拖动${label}位置`}
          onPointerDown={startBoardMove(kind)}
        />
        <button
          type="button"
          className="scene-resize-handle scene-resize-handle-left"
          aria-label={`调整${label}左边缘`}
          title={`拖拽调整${label}左边缘`}
          onPointerDown={startBoardResize(kind, 'left', rect, size, setSize)}
        />
        <button
          type="button"
          className="scene-resize-handle scene-resize-handle-bottom"
          aria-label={`调整${label}底边`}
          title={`拖拽调整${label}底边`}
          onPointerDown={startBoardResize(kind, 'bottom', rect, size, setSize)}
        />
        <button
          type="button"
          className="scene-resize-handle scene-resize-handle-corner"
          aria-label={`调整${label}右下角`}
          title={`拖拽调整${label}右下角`}
          onPointerDown={startBoardResize(kind, 'corner', rect, size, setSize)}
        />
      </div>
    )
  }



  return (

    <div className="scene-host-wrap">

      <div ref={hostRef} className="scene-host" />

      <WorkflowPanel />

      <WhiteboardPreview scene={sceneReady} />

      {renderBoardHandles('whiteboard', '报告白板', whiteboardRect, whiteboardSize, setWhiteboardSize)}

      {renderBoardHandles('log', '任务日志', logBoardRect, logBoardSize, setLogBoardSize)}

    </div>
  )
}
