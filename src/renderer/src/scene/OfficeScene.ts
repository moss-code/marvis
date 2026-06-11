import { Application, Container, Graphics, Text, FillGradient } from 'pixi.js'
import type { Pony, PonyId } from '@shared/types'
import { ENV } from './palettes'
import { PonyActor } from './PonyActor'
import { updateTweens, animate } from './tween'

const DESIGN_W = 1680
const DESK_XS = [220, 450, 680, 910, 1140, 1370]
const WHITEBOARD_X = 1020

/**
 * 侧视办公室场景：背景层（墙/地板/窗光/白板/绿植/吊灯）+ 小马层 + 工位层。
 * 背景按实际屏幕尺寸绘制，场景物件等比缩放、贴地对齐。
 */
export class OfficeScene {
  readonly app: Application
  private bg = new Graphics()
  private world = new Container()
  private ponyLayer = new Container()
  private deskLayer = new Container()
  private whiteboard = new Container()
  private pinnedPaper: Graphics | null = null
  private pinBadge: Text | null = null
  private reportPinCount = 0
  private actors = new Map<PonyId, PonyActor>()
  private ponyDeskIndex = new Map<PonyId, number>()
  private deskScreens: Graphics[] = []
  private activeDesks = new Set<number>()
  private lampHalos: Graphics[] = []
  private dustLayer = new Container()
  private dust: { g: Graphics; x: number; y: number; vx: number; vy: number; phase: number }[] =
    []
  private ambientT = 0
  private hireSlot = new Container()
  onWhiteboardClick: (() => void) | null = null
  onPonyClick: ((id: PonyId) => void) | null = null
  onHireClick: (() => void) | null = null

  private constructor(app: Application) {
    this.app = app
  }

  static async create(host: HTMLElement): Promise<OfficeScene> {
    const app = new Application()
    await app.init({
      resizeTo: host,
      background: ENV.wallTop,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true
    })
    host.appendChild(app.canvas)

    const scene = new OfficeScene(app)
    scene.buildWorld()
    app.stage.addChild(scene.bg, scene.world)
    scene.layout()
    app.renderer.on('resize', () => scene.layout())
    app.ticker.add((ticker) => {
      updateTweens(ticker.deltaMS)
      scene.ambientT += ticker.deltaMS
      scene.updateAmbient(ticker.deltaMS)
      for (const actor of scene.actors.values()) actor.update(ticker.deltaMS)
    })
    return scene
  }

  /** —— 固定的场景物件（设计坐标系：地面 y=0）—— */
  private buildWorld(): void {
    const props = new Graphics()

    // 窗户（左中部墙面）
    const winX = 80
    props.roundRect(winX, -430, 300, 240, 10).fill(0xe3d8c2)
    const winLight = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xfdf8e8 },
        { offset: 1, color: 0xf7ecd2 }
      ]
    })
    props.roundRect(winX + 10, -420, 280, 220, 8).fill(winLight)
    props.rect(winX + 146, -420, 8, 220).fill(0xe3d8c2)
    props.rect(winX + 10, -316, 280, 8).fill(0xe3d8c2)
    // 洒进来的光
    props.poly([winX + 10, -200, winX + 290, -200, winX + 390, 0, winX - 60, 0]).fill({
      color: ENV.windowLight,
      alpha: 0.16
    })

    // 吊灯 × 3（光晕单独引用以便呼吸动画）
    for (let i = 0; i < 3; i++) {
      const lx = [560, 880, 1200][i]
      props.rect(lx - 1.5, -560, 3, 90).fill(0x8a6f4d)
      props.moveTo(lx - 26, -470).arcTo(lx, -512, lx + 26, -470, 30).lineTo(lx + 26, -470).fill(ENV.brass)
      props.circle(lx, -462, 7).fill({ color: 0xffe9b8, alpha: 0.95 })
      const halo = new Graphics()
      halo.circle(lx, -460, 26).fill({ color: 0xffe9b8, alpha: 0.1 })
      this.lampHalos.push(halo)
      this.world.addChild(halo)
    }

    // 绿植 × 2
    for (const px of [40, 1160]) {
      props.roundRect(px - 26, -64, 52, 64, 8).fill(ENV.pot)
      props.roundRect(px - 30, -70, 60, 12, 4).fill(0x96714a)
      props.circle(px - 16, -96, 22).fill(ENV.plant)
      props.circle(px + 14, -104, 26).fill(ENV.plantDark)
      props.circle(px - 2, -130, 22).fill(ENV.plant)
    }
    this.world.addChild(props)

    // 白板（报告入口）
    this.buildWhiteboard()
    this.world.addChild(this.whiteboard)

    this.buildDust()
    this.world.addChild(this.dustLayer)
    this.world.addChild(this.ponyLayer)

    // 工位（小马站在桌后，桌子盖在前面）
    for (let i = 0; i < DESK_XS.length; i++) {
      const dx = DESK_XS[i]
      const desk = new Graphics()
      desk.roundRect(dx - 80, -58, 160, 10, 5).fill(ENV.deskWood)
      desk.roundRect(dx - 80, -50, 160, 3, 2).fill(ENV.deskWoodDark)
      desk.roundRect(dx - 70, -48, 10, 48, 3).fill(ENV.deskWoodDark)
      desk.roundRect(dx + 60, -48, 10, 48, 3).fill(ENV.deskWoodDark)
      desk.roundRect(dx - 4, -82, 28, 20, 3).fill(0x5a4c3d)
      desk.roundRect(dx - 8, -62, 36, 4, 2).fill(0x4a4036)
      this.deskLayer.addChild(desk)
      const screen = new Graphics()
      screen.roundRect(dx - 1, -78, 22, 14, 2).fill(0xf7f1e5)
      this.deskScreens.push(screen)
      this.deskLayer.addChild(screen)
    }
    this.world.addChild(this.deskLayer)
    this.buildHireSlot()
    this.world.addChild(this.hireSlot)
  }

  private buildDust(): void {
    for (let i = 0; i < 12; i++) {
      const g = new Graphics()
      g.circle(0, 0, 2 + Math.random()).fill({ color: 0xfff8e8, alpha: 0.25 })
      const p = {
        g,
        x: 100 + Math.random() * 250,
        y: -180 + Math.random() * 160,
        vx: 0.012 + Math.random() * 0.018,
        vy: -0.012 + Math.random() * 0.014,
        phase: Math.random() * 10
      }
      g.position.set(p.x, p.y)
      this.dust.push(p)
      this.dustLayer.addChild(g)
    }
  }

  /** 合并进现有 ticker：吊灯呼吸、窗光尘埃、工位屏幕闪烁 */
  updateAmbient(dtMs: number): void {
    for (let i = 0; i < this.lampHalos.length; i++) {
      const phase = this.ambientT * 0.001 + i * 2.1
      this.lampHalos[i].alpha = 0.06 + 0.08 * (0.5 + 0.5 * Math.sin(phase))
    }

    for (const p of this.dust) {
      p.x += p.vx * dtMs
      p.y += p.vy * dtMs
      if (p.x > 360) p.x = 90
      if (p.x < 90) p.x = 360
      if (p.y > -15) p.y = -185
      if (p.y < -185) p.y = -15
      p.g.position.set(p.x, p.y)
      p.g.alpha = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(this.ambientT * 0.002 + p.phase))
    }

    for (const idx of this.activeDesks) {
      const screen = this.deskScreens[idx]
      if (!screen) continue
      const flicker = 0.55 + 0.45 * Math.abs(Math.sin(this.ambientT * 0.008 + idx))
      screen.alpha = flicker
      screen.tint = flicker > 0.85 ? 0xe8f4ff : 0xf7f1e5
    }
  }

  /** 小马干活时工位笔记本屏幕闪烁 */
  setDeskActive(id: PonyId, on: boolean): void {
    const idx = this.ponyDeskIndex.get(id)
    if (idx == null) return
    if (on) {
      this.activeDesks.add(idx)
    } else {
      this.activeDesks.delete(idx)
      const screen = this.deskScreens[idx]
      if (screen) {
        screen.alpha = 1
        screen.tint = 0xffffff
      }
    }
  }

  private buildHireSlot(): void {
    const dx = DESK_XS[5]
    const g = new Graphics()
    g.roundRect(dx - 50, -120, 100, 100, 8)
      .stroke({ width: 2, color: ENV.brass, alpha: 0.55 })
    g.roundRect(dx - 42, -36, 84, 28, 6).fill(ENV.deskWood)
    const sign = new Text({
      text: '招聘',
      style: {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: 14,
        fill: ENV.textDark,
        fontWeight: '600'
      }
    })
    sign.anchor.set(0.5)
    sign.position.set(dx, -22)
    this.hireSlot.addChild(g, sign)
    this.hireSlot.position.set(0, 0)
    this.hireSlot.eventMode = 'static'
    this.hireSlot.cursor = 'pointer'
    this.hireSlot.on('pointertap', () => this.onHireClick?.())
  }

  setHireSlotVisible(visible: boolean): void {
    this.hireSlot.visible = visible
  }

  private buildWhiteboard(): void {
    const board = new Graphics()
    board.roundRect(-95, -150, 190, 140, 8).fill(ENV.whiteboard)
    board.roundRect(-95, -150, 190, 140, 8).stroke({ width: 4, color: ENV.brass })
    board.roundRect(-6, -16, 12, 26, 4).fill(0x8a6f4d) // 支架
    board.roundRect(-40, -4, 80, 8, 4).fill(0x8a6f4d)
    // 占位涂鸦线
    board.roundRect(-70, -128, 90, 6, 3).fill({ color: 0xd9cbb5 })
    board.roundRect(-70, -110, 140, 5, 2.5).fill({ color: 0xe5dac6 })
    board.roundRect(-70, -96, 120, 5, 2.5).fill({ color: 0xe5dac6 })

    const label = new Text({
      text: '报告白板',
      style: { fontFamily: '"Microsoft YaHei", sans-serif', fontSize: 12, fill: ENV.textDark }
    })
    label.anchor.set(0.5, 0)
    label.position.set(0, 8)
    label.alpha = 0.7

    this.whiteboard.addChild(board, label)
    this.whiteboard.position.set(WHITEBOARD_X, -228)
    this.whiteboard.eventMode = 'static'
    this.whiteboard.cursor = 'pointer'
    this.whiteboard.on('pointertap', () => this.onWhiteboardClick?.())
  }

  /** 背景重绘 + 世界缩放贴地 */
  private layout(): void {
    const w = this.app.screen.width
    const h = this.app.screen.height
    const floorH = Math.max(88, h * 0.16)
    const floorY = h - floorH

    this.bg.clear()
    const wall = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: ENV.wallTop },
        { offset: 1, color: ENV.wallBottom }
      ]
    })
    this.bg.rect(0, 0, w, floorY).fill(wall)
    this.bg.rect(0, floorY, w, floorH).fill(ENV.floor)
    this.bg.rect(0, floorY, w, 5).fill(ENV.floorEdge)
    // 地板木纹
    for (let x = 60; x < w; x += 120) {
      this.bg.rect(x, floorY + 8, 2, floorH - 8).fill({ color: ENV.floorEdge, alpha: 0.35 })
    }

    const scale = Math.min(w / DESIGN_W, (h * 0.68) / 620)
    this.world.scale.set(scale)
    this.world.position.set((w - DESIGN_W * scale) / 2, floorY + floorH * 0.62 * scale)
  }

  /** —— 对外 API —— */

  addPony(pony: Pony, deskIndex: number, startX?: number): PonyActor {
    const actor = new PonyActor(pony)
    actor.homeX = DESK_XS[deskIndex] ?? DESK_XS[DESK_XS.length - 1]
    actor.position.set(startX ?? actor.homeX, 0)
    actor.on('pointertap', () => this.onPonyClick?.(pony.id))
    this.ponyLayer.addChild(actor)
    this.actors.set(pony.id, actor)
    this.ponyDeskIndex.set(pony.id, deskIndex)
    return actor
  }

  removePony(id: PonyId): void {
    const actor = this.actors.get(id)
    if (!actor) return
    this.setDeskActive(id, false)
    this.ponyLayer.removeChild(actor)
    actor.destroy({ children: true })
    this.actors.delete(id)
    this.ponyDeskIndex.delete(id)
  }

  async playEntrance(pony: Pony, deskIndex: number): Promise<void> {
    const actor = this.addPony(pony, deskIndex, DESIGN_W + 80)
    const spot = new Graphics()
    spot.ellipse(0, -20, 52, 28).fill({ color: 0xffe9b8, alpha: 0.32 })
    spot.position.set(actor.x, actor.y - 8)
    this.ponyLayer.addChildAt(spot, 0)
    await actor.walkTo(actor.homeX)
    await animate(700, (p) => {
      spot.alpha = 0.32 * (1 - p)
    })
    spot.destroy({ children: true })
    await actor.say(`大家好，我是${pony.name}！`, 2000)
  }

  async playDismissal(id: PonyId): Promise<void> {
    const actor = this.actors.get(id)
    if (!actor) return
    await actor.say('再见！', 1400)
    await actor.walkTo(DESIGN_W + 80)
    this.removePony(id)
  }

  updatePonySkin(id: PonyId, skin: Pony['skin']): void {
    this.actors.get(id)?.applySkin(skin)
  }

  updatePony(id: PonyId, pony: Pony): void {
    this.actors.get(id)?.updateFromPony(pony)
  }

  getActor(id: PonyId): PonyActor | undefined {
    return this.actors.get(id)
  }

  getDeskX(id: PonyId): number {
    return this.actors.get(id)?.homeX ?? DESK_XS[0]
  }

  getWhiteboardX(): number {
    return WHITEBOARD_X - 100
  }

  /** 白板钉上新报告：贴纸出现 + 脉冲；≥2 份时显示数字徽标 */
  async pinReport(title: string): Promise<void> {
    this.reportPinCount++
    if (this.pinnedPaper) this.pinnedPaper.destroy()
    if (this.pinBadge) {
      this.pinBadge.destroy()
      this.pinBadge = null
    }
    const paper = new Graphics()
    paper.roundRect(-60, -120, 120, 86, 4).fill(0xffffff)
    paper.roundRect(-60, -120, 120, 86, 4).stroke({ width: 1.5, color: ENV.bubbleBorder })
    paper.roundRect(-48, -106, 96, 7, 3).fill(0xc97d5e)
    paper.roundRect(-48, -90, 70, 5, 2.5).fill(0xd9cbb5)
    paper.roundRect(-48, -76, 86, 5, 2.5).fill(0xd9cbb5)
    paper.roundRect(-48, -62, 60, 5, 2.5).fill(0xd9cbb5)
    paper.circle(0, -114, 4).fill(ENV.brass) // 黄铜图钉
    paper.rotation = -0.04
    this.pinnedPaper = paper
    this.whiteboard.addChild(paper)

    await animate(500, (p) => {
      const s = p < 0.6 ? 0.6 + p * 0.83 : 1.1 - (p - 0.6) * 0.25
      paper.scale.set(s)
      paper.alpha = Math.min(1, p * 2)
    })

    if (this.reportPinCount >= 2) {
      const badge = new Text({
        text: String(this.reportPinCount),
        style: {
          fontFamily: 'Georgia, serif',
          fontSize: 11,
          fill: 0x3e3428,
          fontWeight: '700'
        }
      })
      badge.anchor.set(0.5)
      const brass = new Graphics()
      brass.circle(0, 0, 11).fill(ENV.brass)
      brass.position.set(52, -118)
      badge.position.set(52, -118)
      this.whiteboard.addChild(brass, badge)
      this.pinBadge = badge
    }
    void title
  }

  destroy(): void {
    this.app.destroy(true, { children: true })
  }
}
