import { useEffect, useRef } from 'react'
import { OfficeScene } from './OfficeScene'
import { SceneDirector } from './SceneDirector'
import { sceneBus } from './sceneBus'
import { useAppStore } from '@/store/appStore'

/** Pixi 画布宿主：挂载办公室场景并入驻小马 */
export function SceneCanvas(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const ponies = useAppStore((s) => s.ponies)
  const sceneRef = useRef<OfficeScene | null>(null)
  const seeded = useRef(false)

  useEffect(() => {
    let disposed = false
    if (!hostRef.current) return
    OfficeScene.create(hostRef.current).then((scene) => {
      if (disposed) {
        scene.destroy()
        return
      }
      sceneRef.current = scene
      sceneBus.director = new SceneDirector(scene)
      scene.onWhiteboardClick = () => {
        const { reports, openReport } = useAppStore.getState()
        if (reports.length > 0) openReport(reports[0].id)
      }
      maybeSeed()
    })
    return () => {
      disposed = true
      seeded.current = false
      sceneBus.director = null
      sceneRef.current?.destroy()
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    maybeSeed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ponies])

  function maybeSeed(): void {
    const scene = sceneRef.current
    if (!scene || seeded.current) return
    const roster = useAppStore.getState().ponies
    if (roster.length === 0) return
    seeded.current = true
    roster.forEach((p, i) => scene.addPony(p, i))
  }

  return <div ref={hostRef} className="scene-host" />
}
