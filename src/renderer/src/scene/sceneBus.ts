import type { PonyId } from '@shared/types'
import type { OfficeScene } from './OfficeScene'
import type { SceneDirector } from './SceneDirector'

/** SceneCanvas 挂载后注入，App 层把 AgentEvent 转发给导演 */
export const sceneBus: {
  director: SceneDirector | null
  scene: OfficeScene | null
  onPonyClick: ((id: PonyId) => void) | null
  onHireClick: (() => void) | null
  onLogClick: (() => void) | null
  replayReportId: string | null
} = {
  director: null,
  scene: null,
  onPonyClick: null,
  onHireClick: null,
  onLogClick: null,
  replayReportId: null
}
