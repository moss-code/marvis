import type { SceneDirector } from './SceneDirector'

/** SceneCanvas 挂载后注入，App 层把 AgentEvent 转发给导演 */
export const sceneBus: { director: SceneDirector | null } = { director: null }
