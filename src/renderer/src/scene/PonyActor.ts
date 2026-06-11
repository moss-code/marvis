import { Container, Graphics, Text } from 'pixi.js'
import type { Pony, PonySkin } from '@shared/types'
import { PALETTES, ENV, type PonyPalette } from './palettes'
import { animate, lerp, linear } from './tween'
import { Bubble } from './Bubble'

type PonyState = 'idle' | 'walk' | 'work'

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

  private t = Math.random() * 10000
  private blinkTimer = 1500 + Math.random() * 2500
  private blinkLeft = 0
  private currentBubble: Bubble | null = null
  private nameLabel!: Text
  private shadow!: Graphics
  homeX = 0

  constructor(pony: Pony) {
    super()
    this.pony = pony
    this.pal = PALETTES[pony.skin.palette] ?? PALETTES.linen
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.build()
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
    this.currentBubble = null
    this.build()
    this.state = savedState
    this.workDotsGroup.visible = savedState === 'work'
  }

  private build(): void {
    this.shadow = new Graphics()
    this.shadow.ellipse(0, 6, 30, 9).fill({ color: 0x3e3428, alpha: 0.16 })
    this.addChild(this.shadow)

    const p = this.pal
    this.addChild(this.rig)

    // —— 腿（后对 / 前对，髋部为支点）——
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

    // —— 身体组（呼吸缩放支点在身体中心）——
    this.bodyGroup.position.set(0, -58)
    this.rig.addChild(this.bodyGroup)

    const body = new Graphics()
    body.ellipse(0, 0, 44, 27).fill(p.body)
    // 鬃毛沿背部
    body.circle(-34, -16, 9).fill(p.mane)
    body.circle(-24, -21, 8).fill(p.mane)
    // 尾巴
    body.circle(-48, 2, 8).fill(p.mane)
    body.circle(-52, 12, 6.5).fill(p.mane)
    body.circle(-54, 21, 5).fill(p.mane)
    this.bodyGroup.addChild(body)

    // —— 头 ——
    this.head.position.set(40, -28)
    const face = new Graphics()
    face.circle(0, 0, 22).fill(p.body)
    face.ellipse(15, 7, 12, 9).fill(p.muzzle)
    // 耳朵
    face.poly([-8, -19, 0, -32, 6, -18]).fill(p.body)
    // 刘海鬃毛
    face.circle(-12, -16, 9).fill(p.mane)
    face.circle(-3, -21, 8).fill(p.mane)
    // 鼻孔
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

    // —— 干活进度点 ——
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

    // —— 名牌 ——
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

  /** 每帧驱动（由 OfficeScene ticker 调用） */
  update(dtMs: number): void {
    this.t += dtMs

    // 呼吸（站立与干活时）
    if (this.state !== 'walk') {
      const s = 1 + 0.018 * Math.sin(this.t * 0.0024)
      this.bodyGroup.scale.set(1, s)
      this.rig.y = 0
      this.rearPair.rotation = 0
    }

    // 眨眼
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

    if (this.state === 'walk') {
      const swing = Math.sin(this.t * 0.013)
      this.frontPair.rotation = swing * 0.5
      this.rearPair.rotation = -swing * 0.5
      this.rig.y = -Math.abs(Math.sin(this.t * 0.013)) * 3.2
    } else if (this.state === 'work') {
      this.frontPair.rotation = Math.sin(this.t * 0.02) * 0.13
      this.head.rotation = Math.sin(this.t * 0.006) * 0.03
      const ss = 1 + 0.06 * Math.sin(this.t * 0.004)
      this.shadow.scale.set(ss, ss * 0.88)
      for (let i = 0; i < this.workDots.length; i++) {
        this.workDots[i].alpha = 0.25 + 0.75 * Math.abs(Math.sin(this.t * 0.004 + i * 0.9))
      }
    } else {
      this.frontPair.rotation = 0
      this.head.rotation = 0
      this.shadow.scale.set(1, 1)
    }
  }

  /** 行走到目标 x（场景坐标），自动转向 */
  async walkTo(targetX: number): Promise<void> {
    const startX = this.x
    const dist = Math.abs(targetX - startX)
    if (dist < 4) return
    this.rig.scale.x = targetX > startX ? 1 : -1
    this.state = 'walk'
    await animate(dist / 0.16, (p) => (this.x = lerp(startX, targetX, p)), linear)
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
    this.state = on ? 'work' : 'idle'
    this.workDotsGroup.visible = on
  }

  /** 挠头道歉：摇头 + 致歉气泡 */
  async apologize(reason: string): Promise<void> {
    this.setWorking(false)
    const shake = animate(900, (p) => {
      this.head.rotation = Math.sin(p * Math.PI * 5) * 0.13
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
