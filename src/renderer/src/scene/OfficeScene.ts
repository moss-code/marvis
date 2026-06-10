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
  private actors = new Map<PonyId, PonyActor>()
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

    // 吊灯 × 3
    for (const lx of [560, 880, 1200]) {
      props.rect(lx - 1.5, -560, 3, 90).fill(0x8a6f4d)
      props.moveTo(lx - 26, -470).arcTo(lx, -512, lx + 26, -470, 30).lineTo(lx + 26, -470).fill(ENV.brass)
      props.circle(lx, -462, 7).fill({ color: 0xffe9b8, alpha: 0.95 })
      props.circle(lx, -460, 26).fill({ color: 0xffe9b8, alpha: 0.1 })
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

    this.world.addChild(this.ponyLayer)

    // 工位（小马站在桌后，桌子盖在前面）
    for (const dx of DESK_XS) {
      const desk = new Graphics()
      desk.roundRect(dx - 80, -58, 160, 10, 5).fill(ENV.deskWood)
      desk.roundRect(dx - 80, -50, 160, 3, 2).fill(ENV.deskWoodDark)
      desk.roundRect(dx - 70, -48, 10, 48, 3).fill(ENV.deskWoodDark)
      desk.roundRect(dx + 60, -48, 10, 48, 3).fill(ENV.deskWoodDark)
      // 笔记本电脑
      desk.roundRect(dx - 4, -82, 28, 20, 3).fill(0x5a4c3d)
      desk.roundRect(dx - 1, -78, 22, 14, 2).fill(0xf7f1e5)
      desk.roundRect(dx - 8, -62, 36, 4, 2).fill(0x4a4036)
      this.deskLayer.addChild(desk)
    }
    this.world.addChild(this.deskLayer)
    this.buildHireSlot()
    this.world.addChild(this.hireSlot)
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
    return actor
  }

  removePony(id: PonyId): void {
    const actor = this.actors.get(id)
    if (!actor) return
    this.ponyLayer.removeChild(actor)
    actor.destroy({ children: true })
    this.actors.delete(id)
  }

  async playEntrance(pony: Pony, deskIndex: number): Promise<void> {
    const actor = this.addPony(pony, deskIndex, DESIGN_W + 80)
    await actor.walkTo(actor.homeX)
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

  /** 白板钉上新报告：贴纸出现 + 脉冲 */
  async pinReport(title: string): Promise<void> {
    if (this.pinnedPaper) this.pinnedPaper.destroy()
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
    void title
  }

  destroy(): void {
    this.app.destroy(true, { children: true })
  }
}
