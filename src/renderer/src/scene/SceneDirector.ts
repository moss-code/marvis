import type { AgentEvent } from '@shared/types'
import { describeEvent } from '@/ui/logLines'
import type { OfficeScene } from './OfficeScene'
import { delay } from './tween'

function trunc(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/**
 * 场景导演：把 AgentEvent 流翻译成办公室里的动画演出。
 * 走动/气泡等长动画进入串行队列，保证演出顺序与事件顺序一致；
 * 工作状态切换即时生效。
 */
export class SceneDirector {
  private queue: Promise<void> = Promise.resolve()

  constructor(private scene: OfficeScene) {}

  handle(ev: AgentEvent): void {
    if (ev.type === 'run_started') this.scene.logBoard.clear()
    const line = describeEvent(ev, (id) => this.scene.getActor(id)?.pony.name ?? id)
    if (line) this.scene.logBoard.push(line)

    switch (ev.type) {
      case 'run_started':
        this.enqueue(async () => {
          await this.scene.getActor('leader')?.say('收到，我来安排！', 1400)
        })
        break

      case 'leader_thinking':
        this.scene.getActor('leader')?.setWorking(true)
        break

      case 'task_dispatched':
        this.enqueue(async () => {
          const leader = this.scene.getActor('leader')
          const target = this.scene.getActor(ev.to)
          if (!leader || !target) return
          leader.setWorking(false)
          const desk = this.scene.getDeskPosition(ev.to)
          await leader.walkTo(desk.x - 110, desk.y)
          await leader.say(`${target.pony.name}，${trunc(ev.brief, 42)}`, 2400)
          void leader.walkTo(leader.homeX, leader.homeY).then(() => leader.setWorking(true))
        })
        break

      case 'tool_call_started': {
        const actor = this.scene.getActor(ev.pony)
        actor?.clearWaiting()
        actor?.setWorking(true)
        this.scene.setDeskActive(ev.pony, true)
        break
      }

      case 'approval_required': {
        this.scene.setDeskActive(ev.pony, false)
        const actor = this.scene.getActor(ev.pony)
        actor?.setWaiting(true)
        void actor?.say('等你确认…', 1200)
        break
      }

      case 'tool_call_finished': {
        const actor = this.scene.getActor(ev.pony)
        actor?.clearWaiting()
        actor?.setWorking(false)
        this.scene.setDeskActive(ev.pony, false)
        if (ev.ok) {
          void actor?.nodOnce()
          this.scene.flashDeskSuccess(ev.pony)
        } else {
          this.enqueue(async () => {
            await actor?.say(`唔，出错了，再试一次…`, 1500, 'error')
          })
        }
        break
      }

      case 'task_completed':
        this.scene.setDeskActive(ev.pony, false)
        this.enqueue(async () => {
          const actor = this.scene.getActor(ev.pony)
          if (!actor) return
          actor.setWorking(false)
          await actor.handoffBrief()
          await actor.say(`搞定！${trunc(ev.summary, 36)}`, 2000)
        })
        break

      case 'task_failed':
        this.scene.setDeskActive(ev.pony, false)
        this.enqueue(async () => {
          const actor = this.scene.getActor(ev.pony)
          if (!actor) return
          actor.clearWaiting()
          await actor.apologize(trunc(ev.reason, 60))
        })
        break

      case 'report_ready':
        this.enqueue(async () => {
          const reporter = this.scene.getActor('report')
          if (reporter) {
            reporter.setWorking(false)
            await reporter.walkTo(this.scene.getWhiteboardX(), 0)
            await this.scene.pinReport(ev.title)
            await reporter.say(`《${trunc(ev.title, 24)}》钉好了，点白板查看`, 2400)
            void reporter.walkTo(reporter.homeX, reporter.homeY)
          } else {
            await this.scene.pinReport(ev.title)
          }
        })
        break

      case 'run_finished':
        this.enqueue(async () => {
          const leader = this.scene.getActor('leader')
          leader?.setWorking(false)
          if (
            leader &&
            (Math.abs(leader.x - leader.homeX) > 4 || Math.abs(leader.y - leader.homeY) > 4)
          ) {
            await leader.walkTo(leader.homeX, leader.homeY)
          }
          this.scene.clearAllWaiting()
          await delay(100)
        })
        break
    }
  }

  private enqueue(step: () => Promise<void>): void {
    this.queue = this.queue.then(step).catch((err) => console.error('[SceneDirector]', err))
  }
}
