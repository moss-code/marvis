import type { AgentEvent } from '@shared/types'
import { AudioDirector } from '@/audio/AudioDirector'
import { sceneBus } from '@/scene/sceneBus'

function delayMs(prev: AgentEvent | null, next: AgentEvent): number {
  if (next.type === 'leader_say') return 30
  if (prev?.type === 'tool_call_started' && next.type === 'tool_call_finished') return 1200
  return 800
}

/** 历史任务场景回放：事件只送 SceneDirector / AudioDirector，绝不污染 store */
export class ReplayDirector {
  private static inst: ReplayDirector | null = null

  static get(): ReplayDirector {
    if (!this.inst) this.inst = new ReplayDirector()
    return this.inst
  }

  private played: AgentEvent[] = []
  private pending: AgentEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private speed = 1
  private active = false
  private runId = ''
  private onLogUpdate: ((events: AgentEvent[]) => void) | null = null
  private onActiveChange: ((active: boolean) => void) | null = null

  get isActive(): boolean {
    return this.active
  }

  getSpeed(): 1 | 2 {
    return this.speed as 1 | 2
  }

  start(
    events: AgentEvent[],
    onLogUpdate: (events: AgentEvent[]) => void,
    onActiveChange: (active: boolean) => void
  ): void {
    this.finish(false)
    this.played = []
    this.pending = [...events]
    this.speed = 1
    const started = events.find((e) => e.type === 'run_started')
    this.runId = started?.type === 'run_started' ? started.runId : 'replay'
    this.active = true
    this.onLogUpdate = onLogUpdate
    this.onActiveChange = onActiveChange
    sceneBus.replayReportId = null
    onActiveChange(true)
    onLogUpdate([])
    this.scheduleNext(null)
  }

  stop(): void {
    this.finish(true)
  }

  setSpeed(mult: 1 | 2): void {
    this.speed = mult
  }

  private dispatch(ev: AgentEvent): void {
    if (ev.type === 'report_ready') {
      sceneBus.replayReportId = ev.reportId
    }
    sceneBus.director?.handle(ev)
    AudioDirector.get().handle(ev)
  }

  private scheduleNext(prev: AgentEvent | null): void {
    if (!this.active) return
    if (this.pending.length === 0) {
      this.finish(false)
      return
    }

    const ev = this.pending.shift()!
    this.played.push(ev)
    this.onLogUpdate?.([...this.played])
    this.dispatch(ev)

    if (ev.type === 'run_finished') {
      this.finish(false)
      return
    }

    if (this.pending.length === 0) {
      this.finish(false)
      return
    }

    const next = this.pending[0]
    const ms = delayMs(ev, next) / this.speed
    this.timer = setTimeout(() => this.scheduleNext(ev), ms)
  }

  private finish(manual: boolean): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const wasActive = this.active
    this.pending = []
    this.active = false

    if (wasActive && manual) {
      const resetEv: AgentEvent = {
        type: 'run_finished',
        runId: this.runId,
        ok: true,
        finalText: '回放已停止'
      }
      sceneBus.director?.handle(resetEv)
      AudioDirector.get().handle(resetEv)
    }

    sceneBus.replayReportId = null
    this.onLogUpdate?.([])
    this.onActiveChange?.(false)
    this.onLogUpdate = null
    this.onActiveChange = null
  }
}
