import { Container, Graphics, Text } from 'pixi.js'
import type { Pony, PonySkin } from '@shared/types'
import { PALETTES, ENV, type PonyPalette } from './palettes'
import { animate, lerp, linear } from './tween'
import { Bubble } from './Bubble'

type PonyState = 'idle' | 'walk' | 'work' | 'waiting'

export type IdleVariant = 'stretch' | 'lookAround' | 'tailSwish' | 'legScratch' | 'doze' | 'peekScreen'

const IDLE_VARIANT_DURATION: Record<IdleVariant, number> = {
  stretch: 1200,
  lookAround: 1400,
  tailSwish: 1000,
  legScratch: 1100,
  doze: 1600,
  peekScreen: 1300
}

const IDLE_VARIANT_WEIGHTS: { variant: IdleVariant; weight: number }[] = [
  { variant: 'stretch', weight: 20 },
  { variant: 'lookAround', weight: 20 },
  { variant: 'tailSwish', weight: 12 },
  { variant: 'legScratch', weight: 12 },
  { variant: 'doze', weight: 12 },
  { variant: 'peekScreen', weight: 12 }
]

const HEAD_BASE_Y = -28

/** 动画幅度（统一调大时只改这里） */
const ANIM = {
  breath: 0.032,
  weightShift: 3.2,
  tailSwayMicro: 0.028,
  earTwitch: 0.075,
  stretchPeak: 1.085,
  lookRight: 0.2,
  lookLeft: -0.14,
  tailSwishEp: 0.11,
  legScratch: -0.72,
  dozeDroop: 0.11,
  peekDropY: 7,
  peekHeadRot: 0.14,
  walkLegSwing: 0.68,
  walkBounce: 4.8,
  waitHead: 0.085,
  waitBob: 3.5,
  workLeg: 0.2,
  workHead: 0.05,
  workShadowPulse: 0.095,
  workChartRot: 0.13,
  nodOnce: 0.32,
  apologizeShake: 0.2
} as const

/**
 * 程序化矢量小马：Graphics 圆润色块 + 骨骼式程序动画。
 * 原点在脚底中心；默认朝右，行走时自动翻转。
 */
export class PonyActor extends Container {
  pony: Pony
  private pal: PonyPalette
  private state: PonyState = 'idle'

  private rig = new Container()
  private bodyGroup = new Container()
  private head = new Container()
  private rearPair = new Container()
  private frontPair = new Container()
  private eyelid!: Graphics
  private workDots: Graphics[] = []
  private workDotsGroup = new Container()
  private waitingGroup = new Container()
  private rolePropGroup = new Container()
  private roleBars: Graphics[] = []
  private roleChartLine!: Graphics
  private roleChartPie!: Graphics
  private handoffDoc: Graphics | null = null

  private t = Math.random() * 10000
  private blinkTimer = 1500 + Math.random() * 2500
  private blinkLeft = 0
  private currentBubble: Bubble | null = null
  private nameLabel!: Text
  private shadow!: Graphics

  private ambientEnabled = true
  private ambientCooldownMs = 8000 + Math.random() * 4000
  private idleVariant: IdleVariant | 'none' = 'none'
  private idleVariantPhase = 0
  private idleVariantDuration = 0
  private lastIdleVariant: IdleVariant | 'none' = 'none'
  private earTwitchLeft = 0
  private earTwitchTimer = 3000 + Math.random() * 2000
  private readonly ponyHash: number
  private nodActive = false

  homeX = 0
  homeY = 0

  constructor(pony: Pony) {
    super()
    this.pony = pony
    this.pal = PALETTES[pony.skin.palette] ?? PALETTES.linen
    this.ponyHash = pony.id.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.build()
  }

  getState(): PonyState {
    return this.state
  }

  /** 同步小马数据：换肤重建 Graphics，改名只更新名牌 */
  updateFromPony(pony: Pony): void {
    const skinChanged = JSON.stringify(this.pony.skin) !== JSON.stringify(pony.skin)
    const nameChanged = this.pony.name !== pony.name
    this.pony = pony
    if (skinChanged) {
      this.applySkin(pony.skin)
      return
    }
    if (nameChanged) {
      this.nameLabel.text = pony.name
    }
  }

  /** 换肤后重建矢量绘制，保留位置与动画状态 */
  applySkin(skin: PonySkin): void {
    this.pony.skin = skin
    this.pal = PALETTES[skin.palette] ?? PALETTES.linen
    const savedState = this.state
    for (const child of [...this.children]) {
      child.destroy({ children: true })
    }
    this.rig = new Container()
    this.bodyGroup = new Container()
    this.head = new Container()
    this.rearPair = new Container()
    this.frontPair = new Container()
    this.workDots = []
    this.workDotsGroup = new Container()
    this.waitingGroup = new Container()
    this.rolePropGroup = new Container()
    this.roleBars = []
    this.handoffDoc = null
    this.currentBubble = null
    this.abortIdleVariant()
    this.build()
    this.state = savedState
    this.syncStateVisuals()
  }

  private syncStateVisuals(): void {
    this.workDotsGroup.visible = this.state === 'work' && !this.useRoleWorkProps()
    this.rolePropGroup.visible = this.state === 'work' && this.useRoleWorkProps()
    this.waitingGroup.visible = this.state === 'waiting'
  }

  private useRoleWorkProps(): boolean {
    return this.pony.id === 'data' || this.pony.id === 'report'
  }

  private build(): void {
    this.shadow = new Graphics()
    this.shadow.ellipse(0, 6, 30, 9).fill({ color: 0x3e3428, alpha: 0.16 })
    this.addChild(this.shadow)

    const p = this.pal
    this.addChild(this.rig)

    for (const [pair, hipX] of [
      [this.rearPair, -24],
      [this.frontPair, 20]
    ] as const) {
      const far = new Graphics()
      far.roundRect(-5, -2, 10, 40, 5).fill(darken(p.body, 0.82))
      far.x = 7
      const near = new Graphics()
      near.roundRect(-5, -2, 10, 40, 5).fill(p.body)
      near.x = -4
      pair.addChild(far, near)
      pair.position.set(hipX, -38)
      this.rig.addChild(pair)
    }

    this.bodyGroup.position.set(0, -58)
    this.rig.addChild(this.bodyGroup)

    const body = new Graphics()
    body.ellipse(0, 0, 44, 27).fill(p.body)
    body.circle(-34, -16, 9).fill(p.mane)
    body.circle(-24, -21, 8).fill(p.mane)
    body.circle(-48, 2, 8).fill(p.mane)
    body.circle(-52, 12, 6.5).fill(p.mane)
    body.circle(-54, 21, 5).fill(p.mane)
    this.bodyGroup.addChild(body)

    this.head.position.set(40, HEAD_BASE_Y)
    const face = new Graphics()
    face.circle(0, 0, 22).fill(p.body)
    face.ellipse(15, 7, 12, 9).fill(p.muzzle)
    face.poly([-8, -19, 0, -32, 6, -18]).fill(p.body)
    face.circle(-12, -16, 9).fill(p.mane)
    face.circle(-3, -21, 8).fill(p.mane)
    face.circle(19, 6, 1.4).fill(darken(p.muzzle, 0.7))
    this.head.addChild(face)

    const eye = new Graphics()
    eye.circle(7, -4, 4.6).fill(0xffffff)
    eye.circle(8.2, -3.6, 2.3).fill(0x4a4036)
    this.head.addChild(eye)

    this.eyelid = new Graphics()
    this.eyelid.rect(1, -10, 13, 12).fill(p.body)
    this.eyelid.visible = false
    this.head.addChild(this.eyelid)

    this.buildAccessories()
    this.bodyGroup.addChild(this.head)

    for (let i = 0; i < 3; i++) {
      const dot = new Graphics()
      dot.circle(0, 0, 3.4).fill(ENV.brass)
      dot.x = (i - 1) * 13
      this.workDots.push(dot)
      this.workDotsGroup.addChild(dot)
    }
    this.workDotsGroup.position.set(8, -132)
    this.workDotsGroup.visible = false
    this.addChild(this.workDotsGroup)

    this.buildWaitingIndicator()
    this.waitingGroup.position.set(0, -120)
    this.waitingGroup.visible = false
    this.addChild(this.waitingGroup)

    this.buildRoleProps()
    this.rolePropGroup.position.set(8, -132)
    this.rolePropGroup.visible = false
    this.addChild(this.rolePropGroup)

    this.nameLabel = new Text({
      text: this.pony.name,
      style: {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: 12,
        fill: ENV.textDark
      }
    })
    this.nameLabel.anchor.set(0.5, 0)
    this.nameLabel.position.set(0, 8)
    this.nameLabel.alpha = 0.7
    this.addChild(this.nameLabel)
  }

  private buildWaitingIndicator(): void {
    this.waitingGroup.removeChildren()
    const paw = new Graphics()
    paw.roundRect(-8, -6, 16, 20, 4).fill(this.pal.body)
    paw.roundRect(-10, -18, 8, 14, 3).fill(this.pal.body)
    paw.roundRect(2, -18, 8, 14, 3).fill(this.pal.body)
    paw.position.set(-18, 8)
    this.waitingGroup.addChild(paw)

    const qMark = new Text({
      text: '?',
      style: {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: 22,
        fill: ENV.brass,
        fontWeight: '700'
      }
    })
    qMark.anchor.set(0.5)
    qMark.position.set(6, -4)
    this.waitingGroup.addChild(qMark)
  }

  private buildRoleProps(): void {
    this.rolePropGroup.removeChildren()
    this.roleBars = []

    if (this.pony.id === 'data') {
      const barXs = [-16, 0, 16]
      for (let i = 0; i < 3; i++) {
        const bar = new Graphics()
        const h = 14 + i * 6
        bar.roundRect(-5, -h, 10, h, 2).fill(i === 1 ? ENV.brass : darken(ENV.brass, 0.82))
        bar.pivot.set(0, 0)
        bar.position.set(barXs[i], 0)
        this.roleBars.push(bar)
        this.rolePropGroup.addChild(bar)
      }
      return
    }

    if (this.pony.id === 'report') {
      this.roleChartLine = new Graphics()
      this.roleChartLine.moveTo(-22, 4).lineTo(-8, -10).lineTo(4, 2).lineTo(18, -14).stroke({
        width: 2.2,
        color: ENV.brass
      })
      this.rolePropGroup.addChild(this.roleChartLine)

      this.roleChartPie = new Graphics()
      this.roleChartPie.moveTo(0, 0).arc(0, 0, 14, -Math.PI / 2, Math.PI * 0.35).lineTo(0, 0).fill({
        color: ENV.plant,
        alpha: 0.85
      })
      this.roleChartPie.moveTo(0, 0).arc(0, 0, 14, Math.PI * 0.35, Math.PI * 1.2).lineTo(0, 0).fill({
        color: ENV.brass,
        alpha: 0.75
      })
      this.roleChartPie.position.set(24, -6)
      this.rolePropGroup.addChild(this.roleChartPie)
    }
  }

  private buildAccessories(): void {
    const acc = this.pony.skin.accessories
    if (acc.includes('glasses')) {
      const g = new Graphics()
      g.circle(7, -4, 7).stroke({ width: 1.8, color: ENV.brass })
      g.circle(-9, -4, 7).stroke({ width: 1.8, color: ENV.brass })
      g.moveTo(-2, -4).lineTo(0, -4).stroke({ width: 1.8, color: ENV.brass })
      this.head.addChild(g)
    }
    if (acc.includes('beret')) {
      const g = new Graphics()
      g.ellipse(-3, -26, 15, 7).fill(0x96523b)
      g.circle(-3, -32, 2.5).fill(0x6e3c2b)
      this.head.addChild(g)
    }
    if (acc.includes('bowtie')) {
      const g = new Graphics()
      g.poly([18, 16, 28, 11, 28, 22]).fill(0x96523b)
      g.poly([18, 16, 8, 11, 8, 22]).fill(0x96523b)
      g.circle(18, 16, 2.6).fill(0x6e3c2b)
      this.head.addChild(g)
    }
    if (acc.includes('brass-tag')) {
      const g = new Graphics()
      g.roundRect(20, 12, 14, 9, 2).fill(ENV.brass)
      g.roundRect(22.5, 14.5, 9, 4, 1).fill(0xd9c49a)
      this.head.addChild(g)
    }
  }

  setAmbientEnabled(enabled: boolean): void {
    this.ambientEnabled = enabled
    if (!enabled) {
      this.abortIdleVariant()
    }
  }

  /** DEV：立即播放指定 idle 变体 */
  debugPlayIdleVariant(variant: IdleVariant): void {
    if (this.state !== 'idle') return
    this.startIdleVariant(variant)
  }

  setWaiting(on: boolean): void {
    if (on) {
      if (this.state === 'walk') return
      this.abortIdleVariant()
      this.state = 'waiting'
      this.workDotsGroup.visible = false
      this.rolePropGroup.visible = false
      this.waitingGroup.visible = true
      return
    }
    this.clearWaiting()
  }

  clearWaiting(): void {
    if (this.state !== 'waiting') return
    this.state = 'idle'
    this.waitingGroup.visible = false
  }

  private isEpisodicActive(): boolean {
    return this.idleVariant !== 'none' && this.idleVariantPhase > 0
  }

  private episodicControlsHead(): boolean {
    return (
      this.isEpisodicActive() &&
      (this.idleVariant === 'lookAround' ||
        this.idleVariant === 'doze' ||
        this.idleVariant === 'peekScreen')
    )
  }

  private episodicControlsBodyRotation(): boolean {
    return this.isEpisodicActive() && this.idleVariant === 'tailSwish'
  }

  private episodicControlsBodyScaleY(): boolean {
    return this.isEpisodicActive() && this.idleVariant === 'stretch'
  }

  private episodicControlsFrontLeg(): boolean {
    return this.isEpisodicActive() && this.idleVariant === 'legScratch'
  }

  private resetIdleTransforms(): void {
    this.rig.x = 0
    this.rig.y = 0
    this.bodyGroup.scale.set(1, 1)
    this.bodyGroup.rotation = 0
    this.head.rotation = 0
    this.head.y = HEAD_BASE_Y
    this.frontPair.rotation = 0
    this.rearPair.rotation = 0
  }

  private abortIdleVariant(): void {
    this.idleVariant = 'none'
    this.idleVariantPhase = 0
    this.idleVariantDuration = 0
    if (this.state === 'idle') {
      this.resetIdleTransforms()
    }
  }

  private pickIdleVariant(): IdleVariant {
    const pool: IdleVariant[] = []
    for (const { variant, weight } of IDLE_VARIANT_WEIGHTS) {
      if (variant === this.lastIdleVariant) continue
      for (let i = 0; i < weight; i++) pool.push(variant)
    }
    if (pool.length === 0) {
      return IDLE_VARIANT_WEIGHTS[Math.floor(Math.random() * IDLE_VARIANT_WEIGHTS.length)].variant
    }
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private startIdleVariant(variant: IdleVariant): void {
    this.resetIdleTransforms()
    this.idleVariant = variant
    this.idleVariantDuration = IDLE_VARIANT_DURATION[variant]
    this.idleVariantPhase = this.idleVariantDuration
    this.lastIdleVariant = variant
  }

  private applyIdleVariantProgress(variant: IdleVariant, p: number): void {
    const clamped = Math.min(1, Math.max(0, p))
    switch (variant) {
      case 'stretch': {
        const peak = ANIM.stretchPeak
        const sy =
          clamped < 0.5 ? lerp(1, peak, clamped * 2) : lerp(peak, 1, (clamped - 0.5) * 2)
        this.bodyGroup.scale.set(1, sy)
        break
      }
      case 'lookAround': {
        if (clamped < 0.33) {
          this.head.rotation = lerp(0, ANIM.lookRight, clamped / 0.33)
        } else if (clamped < 0.66) {
          this.head.rotation = lerp(ANIM.lookRight, ANIM.lookLeft, (clamped - 0.33) / 0.33)
        } else {
          this.head.rotation = lerp(ANIM.lookLeft, 0, (clamped - 0.66) / 0.34)
        }
        break
      }
      case 'tailSwish':
        this.bodyGroup.rotation = Math.sin(clamped * Math.PI * 3) * ANIM.tailSwishEp
        break
      case 'legScratch':
        this.frontPair.rotation =
          clamped < 0.5
            ? lerp(0, ANIM.legScratch, clamped * 2)
            : lerp(ANIM.legScratch, 0, (clamped - 0.5) * 2)
        break
      case 'doze': {
        const droop =
          clamped < 0.35
            ? lerp(0, ANIM.dozeDroop, clamped / 0.35)
            : lerp(ANIM.dozeDroop, 0, (clamped - 0.35) / 0.65)
        this.head.rotation = droop
        this.eyelid.visible = clamped >= 0.2 && clamped <= 0.8
        break
      }
      case 'peekScreen': {
        const dip = clamped < 0.45 ? lerp(0, 1, clamped / 0.45) : lerp(1, 0, (clamped - 0.45) / 0.55)
        this.head.y = HEAD_BASE_Y + dip * ANIM.peekDropY
        this.head.rotation = ANIM.peekHeadRot * dip
        break
      }
    }
  }

  private applyBreathing(): void {
    const s = 1 + ANIM.breath * Math.sin(this.t * 0.0024)
    if (!this.episodicControlsBodyScaleY()) {
      this.bodyGroup.scale.set(1, s)
    }
    this.rig.y = 0
    this.rearPair.rotation = 0
  }

  private updateIdleMicro(): void {
    this.rig.x = Math.sin(this.t * 0.0011 + this.ponyHash * 0.01) * ANIM.weightShift

    if (!this.episodicControlsBodyRotation()) {
      this.bodyGroup.rotation = Math.sin(this.t * 0.0018 + this.ponyHash * 0.007) * ANIM.tailSwayMicro
    }

    if (!this.nodActive && !this.episodicControlsHead() && this.earTwitchLeft > 0) {
      const twitchP = 1 - this.earTwitchLeft / 200
      this.head.rotation = Math.sin(twitchP * Math.PI * 2) * ANIM.earTwitch
    }
  }

  private updateIdleEpisodicSchedule(dtMs: number): void {
    if (this.isEpisodicActive()) return
    this.ambientCooldownMs -= dtMs
    if (this.ambientCooldownMs <= 0) {
      this.startIdleVariant(this.pickIdleVariant())
      this.ambientCooldownMs = 8000 + Math.random() * 4000 + (Math.random() - 0.5) * 4000
    }
  }

  private updateIdleEpisodicPlayback(dtMs: number): void {
    if (!this.isEpisodicActive()) return
    this.idleVariantPhase -= dtMs
    const p = 1 - this.idleVariantPhase / this.idleVariantDuration
    this.applyIdleVariantProgress(this.idleVariant as IdleVariant, p)
    if (this.idleVariantPhase <= 0) {
      if (this.idleVariant === 'doze') {
        this.eyelid.visible = false
      }
      this.abortIdleVariant()
    }
  }

  private updateIdleBlink(dtMs: number): void {
    const dozeBlinkHold = this.isEpisodicActive() && this.idleVariant === 'doze'
    if (dozeBlinkHold) return

    if (this.blinkLeft > 0) {
      this.blinkLeft -= dtMs
      this.eyelid.visible = this.blinkLeft > 0
    } else {
      this.blinkTimer -= dtMs
      if (this.blinkTimer <= 0) {
        this.blinkLeft = 130
        this.blinkTimer = 1800 + Math.random() * 2600
      }
    }
  }

  private updateEarTwitchTimer(dtMs: number): void {
    if (this.state !== 'idle' || this.nodActive || this.episodicControlsHead()) return
    if (this.earTwitchLeft > 0) {
      this.earTwitchLeft -= dtMs
      return
    }
    this.earTwitchTimer -= dtMs
    if (this.earTwitchTimer <= 0) {
      this.earTwitchLeft = 200
      this.earTwitchTimer = 3000 + Math.random() * 2000
    }
  }

  /** 每帧驱动（由 OfficeScene ticker 调用） */
  update(dtMs: number): void {
    this.t += dtMs

    if (this.state === 'walk') {
      const swing = Math.sin(this.t * 0.013)
      this.frontPair.rotation = swing * ANIM.walkLegSwing
      this.rearPair.rotation = -swing * ANIM.walkLegSwing
      this.rig.y = -Math.abs(Math.sin(this.t * 0.013)) * ANIM.walkBounce
      this.updateIdleBlink(dtMs)
    } else if (this.state === 'waiting') {
      if (!this.nodActive) {
        this.head.rotation = Math.sin(this.t * 0.003) * ANIM.waitHead
      }
      this.frontPair.rotation = 0
      this.shadow.scale.set(1, 1)
      this.waitingGroup.y = -120 + Math.sin(this.t * 0.004) * ANIM.waitBob
      this.updateIdleBlink(dtMs)
    } else if (this.state === 'work') {
      this.frontPair.rotation = Math.sin(this.t * 0.02) * ANIM.workLeg
      if (!this.nodActive) {
        this.head.rotation = Math.sin(this.t * 0.006) * ANIM.workHead
      }
      const ss = 1 + ANIM.workShadowPulse * Math.sin(this.t * 0.004)
      this.shadow.scale.set(ss, ss * 0.88)

      if (this.pony.id === 'data' && this.roleBars.length > 0) {
        for (let i = 0; i < this.roleBars.length; i++) {
          const baseH = 14 + i * 6
          const scale = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(this.t * 0.005 + i * 0.85))
          this.roleBars[i].scale.y = scale
          this.roleBars[i].y = -baseH * (1 - scale)
        }
      } else if (this.pony.id === 'report' && this.roleChartLine) {
        this.roleChartLine.alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 0.004))
        if (this.roleChartPie) {
          this.roleChartPie.rotation = Math.sin(this.t * 0.003) * ANIM.workChartRot
        }
      } else {
        for (let i = 0; i < this.workDots.length; i++) {
          this.workDots[i].alpha = 0.25 + 0.75 * Math.abs(Math.sin(this.t * 0.004 + i * 0.9))
        }
      }
      this.updateIdleBlink(dtMs)
    } else {
      if (this.isEpisodicActive()) {
        this.updateIdleEpisodicPlayback(dtMs)
      } else {
        this.applyBreathing()
        if (this.ambientEnabled) {
          this.updateIdleEpisodicSchedule(dtMs)
        }
      }

      if (!this.episodicControlsFrontLeg()) {
        this.frontPair.rotation = 0
      }
      this.shadow.scale.set(1, 1)

      this.updateEarTwitchTimer(dtMs)
      this.updateIdleMicro()
      this.updateIdleBlink(dtMs)
    }
  }

  /** 行走到目标坐标（默认 y = homeY），自动转向 */
  async walkTo(targetX: number, targetY?: number): Promise<void> {
    const destY = targetY ?? this.homeY
    const startX = this.x
    const startY = this.y
    const dist = Math.hypot(targetX - startX, destY - startY)
    if (dist < 4) return
    this.abortIdleVariant()
    this.rig.scale.x = targetX > startX ? 1 : -1
    this.state = 'walk'
    await animate(
      dist / 0.16,
      (p) => {
        this.x = lerp(startX, targetX, p)
        this.y = lerp(startY, destY, p)
      },
      linear
    )
    this.state = 'idle'
    this.rig.scale.x = 1
  }

  /** 说话气泡（同一时刻只保留一个） */
  async say(text: string, holdMs = 2200, tone: 'normal' | 'error' = 'normal'): Promise<void> {
    if (this.currentBubble && !this.currentBubble.destroyed) {
      this.currentBubble.destroy({ children: true })
    }
    const bubble = new Bubble(text, tone)
    bubble.position.set(8, -140)
    this.currentBubble = bubble
    this.addChild(bubble)
    await bubble.show(holdMs)
    if (this.currentBubble === bubble) this.currentBubble = null
  }

  setWorking(on: boolean): void {
    if (on) {
      this.abortIdleVariant()
      if (this.state === 'waiting') {
        this.waitingGroup.visible = false
      }
      this.state = 'work'
      const roleProps = this.useRoleWorkProps()
      this.workDotsGroup.visible = !roleProps
      this.rolePropGroup.visible = roleProps
      return
    }
    this.state = 'idle'
    this.workDotsGroup.visible = false
    this.rolePropGroup.visible = false
    this.waitingGroup.visible = false
  }

  /** 工具成功微反馈 ~400ms */
  nodOnce(): Promise<void> {
    this.nodActive = true
    const nod = animate(400, (p) => {
      this.head.rotation = Math.sin(p * Math.PI) * ANIM.nodOnce
    }).then(() => {
      this.head.rotation = 0
      this.nodActive = false
    })
    return nod
  }

  /** 任务完成成果传递 ~600ms */
  async handoffBrief(): Promise<void> {
    if (this.handoffDoc && !this.handoffDoc.destroyed) {
      this.handoffDoc.destroy()
    }
    const doc = new Graphics()
    doc.roundRect(-14, -18, 28, 36, 3).fill(ENV.whiteboard)
    doc.roundRect(-10, -12, 20, 3, 1).fill(ENV.bubbleBorder)
    doc.roundRect(-10, -6, 16, 2, 1).fill(ENV.bubbleBorder)
    doc.roundRect(-10, 0, 18, 2, 1).fill(ENV.bubbleBorder)
    doc.roundRect(-10, 6, 12, 2, 1).fill(ENV.bubbleBorder)
    doc.position.set(20, -90)
    doc.alpha = 0
    this.handoffDoc = doc
    this.addChild(doc)

    const startX = doc.x
    const startY = doc.y
    await animate(600, (p) => {
      doc.alpha = Math.min(1, p * 2)
      doc.x = lerp(startX, startX + 40 * this.rig.scale.x, p)
      doc.y = lerp(startY, startY - 28, p)
      doc.rotation = lerp(0, -0.25 * this.rig.scale.x, p)
    })

    if (this.handoffDoc === doc) {
      doc.destroy()
      this.handoffDoc = null
    }
  }

  /** 挠头道歉：摇头 + 致歉气泡 */
  async apologize(reason: string): Promise<void> {
    this.clearWaiting()
    this.setWorking(false)
    const shake = animate(900, (p) => {
      this.head.rotation = Math.sin(p * Math.PI * 5) * ANIM.apologizeShake
    })
    await Promise.all([shake, this.say(`对不起…没办成：${reason}`, 3200, 'error')])
    this.head.rotation = 0
  }
}

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor)
  const g = Math.round(((color >> 8) & 0xff) * factor)
  const b = Math.round((color & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}
