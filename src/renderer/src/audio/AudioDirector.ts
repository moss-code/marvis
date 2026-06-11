import type { AgentEvent, PonyId } from '@shared/types'

const STORAGE_KEY = 'pony-sound'
const MASTER_GAIN = 0.15
const DEDUPE_MS = 200

type LoopHandle = { stop: () => void }

/** Web Audio 程序合成音效导演（单例） */
export class AudioDirector {
  private static inst: AudioDirector | null = null

  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambient: AudioBufferSourceNode | null = null
  private enabled: boolean
  private keyboardLoops = new Map<PonyId, LoopHandle>()
  private lastPlayed = new Map<string, number>()

  private constructor() {
    this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off'
  }

  static get(): AudioDirector {
    if (!AudioDirector.inst) AudioDirector.inst = new AudioDirector()
    return AudioDirector.inst
  }

  isEnabled(): boolean {
    return this.enabled
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off')
    if (!this.enabled) {
      this.stopAllKeyboardLoops()
      this.stopAmbient()
    }
    return this.enabled
  }

  handle(ev: AgentEvent): void {
    if (!this.enabled) return
    this.ensureContext()
    if (!this.ctx || !this.master) return

    switch (ev.type) {
      case 'run_started':
        this.playDeduped('run_started', () => this.playRunStarted())
        this.startAmbient()
        break
      case 'task_dispatched':
        this.playDeduped('task_dispatched', () => this.playTaskDispatched())
        break
      case 'tool_call_started':
        this.startKeyboardLoop(ev.pony)
        break
      case 'tool_call_finished':
        this.stopKeyboardLoop(ev.pony)
        break
      case 'task_completed':
        this.stopKeyboardLoop(ev.pony)
        this.playDeduped('task_completed', () => this.playTaskCompleted())
        break
      case 'task_failed':
        this.stopKeyboardLoop(ev.pony)
        this.playDeduped('task_failed', () => this.playTaskFailed())
        break
      case 'report_ready':
        this.playDeduped('report_ready', () => this.playReportReady())
        break
      case 'run_finished':
        this.stopAllKeyboardLoops()
        this.stopAmbient()
        this.playDeduped('run_finished', () => this.playRunFinished())
        break
    }
  }

  private ensureContext(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = MASTER_GAIN
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  private playDeduped(key: string, fn: () => void): void {
    const now = performance.now()
    const last = this.lastPlayed.get(key) ?? 0
    if (now - last < DEDUPE_MS) return
    this.lastPlayed.set(key, now)
    fn()
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 1,
    when = 0
  ): void {
    const ctx = this.ctx!
    const master = this.master!
    const t0 = ctx.currentTime + when
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(g)
    g.connect(master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  private playRunStarted(): void {
    this.tone(660, 0.09, 'sine', 0.8)
    this.tone(880, 0.09, 'sine', 0.7, 0.1)
  }

  private playTaskDispatched(): void {
    this.tone(220, 0.12, 'triangle', 0.9)
  }

  private playTaskCompleted(): void {
    this.tone(523.25, 0.12, 'sine', 0.6)
    this.tone(659.25, 0.12, 'sine', 0.55, 0.1)
    this.tone(783.99, 0.11, 'sine', 0.5, 0.2)
  }

  private playTaskFailed(): void {
    this.tone(330, 0.2, 'sine', 0.35)
    this.tone(246.94, 0.2, 'sine', 0.3, 0.15)
  }

  private playReportReady(): void {
    this.playFilteredNoise(0.3, 1500, 3000, 0.5)
    this.tone(1046.5, 0.15, 'sine', 0.4, 0.25)
  }

  private playRunFinished(): void {
    this.tone(880, 0.8, 'sine', 0.5)
    this.tone(1320, 0.6, 'sine', 0.15, 0.05)
  }

  private playFilteredNoise(duration: number, low: number, high: number, gain: number): void {
    const ctx = this.ctx!
    const master = this.master!
    const t0 = ctx.currentTime
    const len = Math.ceil(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = (low + high) / 2
    bp.Q.value = 1.2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + duration * 0.15)
    g.gain.linearRampToValueAtTime(0.001, t0 + duration)
    src.connect(bp)
    bp.connect(g)
    g.connect(master)
    src.start(t0)
    src.stop(t0 + duration + 0.02)
  }

  private startKeyboardLoop(pony: PonyId): void {
    if (this.keyboardLoops.has(pony)) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const burst = (): void => {
      if (stopped) return
      this.playFilteredNoise(0.04, 2000, 3200, 0.35)
      const delay = 70 + Math.random() * 70
      timer = setTimeout(burst, delay)
    }
    burst()

    this.keyboardLoops.set(pony, {
      stop: () => {
        stopped = true
        if (timer) clearTimeout(timer)
        this.keyboardLoops.delete(pony)
      }
    })
  }

  private stopKeyboardLoop(pony: PonyId): void {
    this.keyboardLoops.get(pony)?.stop()
  }

  private stopAllKeyboardLoops(): void {
    for (const h of this.keyboardLoops.values()) h.stop()
    this.keyboardLoops.clear()
  }

  private startAmbient(): void {
    if (this.ambient || !this.ctx || !this.master) return
    const ctx = this.ctx
    const len = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = 0.018
    src.connect(g)
    g.connect(this.master)
    src.start()
    this.ambient = src
  }

  private stopAmbient(): void {
    if (!this.ambient) return
    try {
      this.ambient.stop()
    } catch {
      /* already stopped */
    }
    this.ambient.disconnect()
    this.ambient = null
  }
}
