import { Application, Container, Graphics, Text, FillGradient } from 'pixi.js'

import type { Pony, PonyId } from '@shared/types'

import {

  DESIGN_H,

  DESIGN_W,

  DESK_SLOTS,

  HIRE_DESK_X,

  WHITEBOARD_X,

  WHITEBOARD_Y,

  WALL_BOARD_TOP,

  LOG_BOARD_X,

  LOG_BOARD_Y,

  LOG_BOARD_W,

  LOG_BOARD_H,

  getDeskSlot,

  type DeskSlot

} from '@shared/office'

import { ENV } from './palettes'

import { PonyActor } from './PonyActor'

import { LogBoard } from './LogBoard'

import { updateTweens, animate, cancelAllTweens } from './tween'



const LAMP_XS = [220, 450, 680, 910, 1140, 1370]

type BoardKind = 'whiteboard' | 'log'

interface BoardState {
  baseX: number
  baseY: number
  offsetX: number
  offsetY: number
  scaleX: number
  scaleY: number
}



const HIRE_RECEPTION_PONY: Pony = {

  id: '__hire__' as PonyId,

  name: '接待马',

  role: '招聘接待',

  builtin: true,

  skin: { palette: 'sage', accessories: [] },

  skills: [],

  mcpServers: []

}


/**

 * 侧视办公室场景：双排 12 工位，背景层 + 后排/前排工位与小马分层。

 * 背景按实际屏幕尺寸绘制，场景物件等比缩放、贴地对齐。

 */

export class OfficeScene {

  readonly app: Application

  readonly logBoard: LogBoard



  private bg = new Graphics()

  private ceilingGfx = new Graphics()

  private lampHaloLayer = new Container()

  private world = new Container()

  private backDeskLayer = new Container()

  private backPonyLayer = new Container()

  private frontDeskLayer = new Container()

  private frontPonyLayer = new Container()

  private whiteboard = new Container()

  private hireDeskGroup = new Container()

  private hireSignLabel!: Text

  private hireReception: PonyActor | null = null

  private hireAvailable = true

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

  private layoutScale = 1

  private rightReserve = 440

  private readonly boardStates: Record<BoardKind, BoardState> = {
    whiteboard: { baseX: WHITEBOARD_X, baseY: WHITEBOARD_Y, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
    log: { baseX: LOG_BOARD_X, baseY: LOG_BOARD_Y, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
  }

  private layoutFloorY = 0

  private layoutOriginY = 0

  private layoutOriginX = 0

  private layoutListeners = new Set<() => void>()

  /** 场景布局变化时通知 HTML 白板预览重新定位 */
  onLayoutChange: (() => void) | null = null

  private destroyed = false

  private readonly onResize = (): void => {
    this.layout()
  }



  onWhiteboardClick: (() => void) | null = null

  onPonyClick: ((id: PonyId) => void) | null = null

  onHireClick: (() => void) | null = null

  onLogClick: (() => void) | null = null



  private constructor(app: Application) {

    this.app = app

    this.logBoard = new LogBoard()

  }

  setRightReserve(width: number): void {
    this.rightReserve = width
    this.layout()
  }

  setWhiteboardSize(scaleX: number, scaleY: number): void {
    this.setBoardSize('whiteboard', scaleX, scaleY)
  }

  setLogBoardSize(scaleX: number, scaleY: number): void {
    this.setBoardSize('log', scaleX, scaleY)
  }

  resizeBoardFromHandle(
    kind: BoardKind,
    scaleX: number,
    scaleY: number,
    handle: 'left' | 'bottom' | 'corner'
  ): void {
    const current = this.boardStates[kind]
    const candidate: BoardState = { ...current, scaleX, scaleY }
    const prevRect = this.getBoardFrameRectFromState(current)
    const nextRect = this.getBoardFrameRectFromState(candidate)

    if (handle === 'left') {
      candidate.offsetX += (prevRect.width - nextRect.width) / this.layoutScale / 2
    } else if (handle === 'bottom') {
      candidate.offsetY += (nextRect.height - prevRect.height) / this.layoutScale / 2
    } else {
      candidate.offsetX += (nextRect.width - prevRect.width) / this.layoutScale / 2
      candidate.offsetY += (nextRect.height - prevRect.height) / this.layoutScale / 2
    }

    this.commitBoardState(kind, candidate)
  }

  moveBoard(kind: BoardKind, deltaScreenX: number, deltaScreenY: number): void {
    const current = this.boardStates[kind]
    const candidate: BoardState = {
      ...current,
      offsetX: current.offsetX + deltaScreenX / this.layoutScale,
      offsetY: current.offsetY + deltaScreenY / this.layoutScale
    }
    this.commitBoardState(kind, candidate)
  }

  getBoardSize(kind: BoardKind): { scaleX: number; scaleY: number } {
    const { scaleX, scaleY } = this.boardStates[kind]
    return { scaleX, scaleY }
  }

  addLayoutListener(listener: () => void): () => void {
    this.layoutListeners.add(listener)
    return () => this.layoutListeners.delete(listener)
  }

  private emitLayoutChange(): void {
    this.onLayoutChange?.()
    for (const listener of this.layoutListeners) listener()
  }

  private setBoardSize(kind: BoardKind, scaleX: number, scaleY: number): void {
    this.commitBoardState(kind, { ...this.boardStates[kind], scaleX, scaleY })
  }

  private commitBoardState(kind: BoardKind, candidate: BoardState): void {
    const normalized = this.normalizeBoardState(kind, candidate)
    if (!normalized) return
    this.boardStates[kind] = normalized
    this.applyBoardTransforms()
  }

  private normalizeBoardState(kind: BoardKind, candidate: BoardState): BoardState | null {
    const MIN_SCALE_X = 0.72
    const MAX_SCALE_X = 2.4
    const MIN_SCALE_Y = 0.72
    const MAX_SCALE_Y = 2.6
    const bounds = this.getBoardScreenBounds()
    const maxWidthScale = Math.min(MAX_SCALE_X, Math.max(MIN_SCALE_X, (bounds.width - 12) / (LOG_BOARD_W * this.layoutScale)))
    const maxHeightScale = Math.min(MAX_SCALE_Y, Math.max(MIN_SCALE_Y, (bounds.height - 12) / (LOG_BOARD_H * this.layoutScale)))
    const next: BoardState = {
      ...candidate,
      scaleX: Math.min(maxWidthScale, Math.max(MIN_SCALE_X, candidate.scaleX)),
      scaleY: Math.min(maxHeightScale, Math.max(MIN_SCALE_Y, candidate.scaleY))
    }

    this.clampBoardStateToBounds(next, bounds)

    const otherRect = this.getBoardFrameRect(kind === 'whiteboard' ? 'log' : 'whiteboard')
    const resolved = this.resolveBoardOverlap(next, otherRect, bounds)
    if (!resolved) return null
    return next
  }

  private clampBoardStateToBounds(
    state: BoardState,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): void {
    const rect = this.getBoardFrameRectFromState(state)
    if (rect.x < bounds.left) state.offsetX += (bounds.left - rect.x) / this.layoutScale
    if (rect.y < bounds.top) state.offsetY += (bounds.top - rect.y) / this.layoutScale
    if (rect.x + rect.width > bounds.right) state.offsetX -= (rect.x + rect.width - bounds.right) / this.layoutScale
    if (rect.y + rect.height > bounds.bottom) state.offsetY -= (rect.y + rect.height - bounds.bottom) / this.layoutScale
  }

  private resolveBoardOverlap(
    state: BoardState,
    otherRect: { x: number; y: number; width: number; height: number },
    bounds: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    const gap = 10
    let rect = this.getBoardFrameRectFromState(state)
    if (!this.rectsOverlap(rect, otherRect, gap)) return true

    const centerX = rect.x + rect.width / 2
    const otherCenterX = otherRect.x + otherRect.width / 2
    const moveLeft = centerX <= otherCenterX
    const horizontalDelta = moveLeft
      ? rect.x + rect.width + gap - otherRect.x
      : otherRect.x + otherRect.width + gap - rect.x

    if (horizontalDelta > 0) {
      state.offsetX += (moveLeft ? -horizontalDelta : horizontalDelta) / this.layoutScale
      this.clampBoardStateToBounds(state, bounds)
      rect = this.getBoardFrameRectFromState(state)
      if (!this.rectsOverlap(rect, otherRect, gap)) return true
    }

    const centerY = rect.y + rect.height / 2
    const otherCenterY = otherRect.y + otherRect.height / 2
    const moveUp = centerY <= otherCenterY
    const verticalDelta = moveUp
      ? rect.y + rect.height + gap - otherRect.y
      : otherRect.y + otherRect.height + gap - rect.y

    if (verticalDelta > 0) {
      state.offsetY += (moveUp ? -verticalDelta : verticalDelta) / this.layoutScale
      this.clampBoardStateToBounds(state, bounds)
      rect = this.getBoardFrameRectFromState(state)
    }

    return !this.rectsOverlap(rect, otherRect, gap)
  }

  private getBoardScreenBounds(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    const left = 28
    const top = 88
    const right = Math.max(left + 280, this.app.screen.width - this.rightReserve - 20)
    const bottom = Math.max(top + 220, this.layoutFloorY - 16)
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }

  private rectsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
    gap: number
  ): boolean {
    return !(
      a.x + a.width + gap <= b.x ||
      b.x + b.width + gap <= a.x ||
      a.y + a.height + gap <= b.y ||
      b.y + b.height + gap <= a.y
    )
  }

  private applyBoardTransforms(): void {
    const whiteboardState = this.boardStates.whiteboard
    this.whiteboard.position.set(
      whiteboardState.baseX + whiteboardState.offsetX,
      whiteboardState.baseY + whiteboardState.offsetY
    )
    this.whiteboard.scale.set(whiteboardState.scaleX, whiteboardState.scaleY)

    const logState = this.boardStates.log
    this.logBoard.position.set(logState.baseX + logState.offsetX, logState.baseY + logState.offsetY)
    this.logBoard.scale.set(logState.scaleX, logState.scaleY)

    this.emitLayoutChange()
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

    const ceilingLayer = new Container()
    ceilingLayer.addChild(scene.ceilingGfx, scene.lampHaloLayer)
    app.stage.addChild(scene.bg, ceilingLayer, scene.world)

    scene.layout()

    app.renderer.on('resize', scene.onResize)

    app.ticker.add((ticker) => {

      updateTweens(ticker.deltaMS)

      scene.ambientT += ticker.deltaMS

      scene.updateAmbient(ticker.deltaMS)

      for (const actor of scene.actors.values()) actor.update(ticker.deltaMS)

      scene.hireReception?.update(ticker.deltaMS)

    })

    return scene

  }



  private buildWorld(): void {

    const props = new Graphics()



    const winX = 480
    const winY = -800

    props.roundRect(winX, winY, 300, 240, 10).fill(0xe3d8c2)

    const winLight = new FillGradient({

      type: 'linear',

      start: { x: 0, y: 0 },

      end: { x: 0, y: 1 },

      colorStops: [

        { offset: 0, color: 0xfdf8e8 },

        { offset: 1, color: 0xf7ecd2 }

      ]

    })

    props.roundRect(winX + 10, winY + 10, 280, 220, 8).fill(winLight)

    props.rect(winX + 146, winY + 10, 8, 220).fill(0xe3d8c2)

    props.rect(winX + 10, winY + 114, 280, 8).fill(0xe3d8c2)

    props.poly([winX + 10, winY + 220, winX + 290, winY + 220, winX + 890, 0, winX - 460, 0]).fill({

      color: ENV.windowLight,

      alpha: 0.16

    })



    for (const px of [40, DESIGN_W - 24]) {

      props.roundRect(px - 26, -64, 52, 64, 8).fill(ENV.pot)

      props.roundRect(px - 30, -70, 60, 12, 4).fill(0x96714a)

      props.circle(px - 16, -96, 22).fill(ENV.plant)

      props.circle(px + 14, -104, 26).fill(ENV.plantDark)

      props.circle(px - 2, -130, 22).fill(ENV.plant)

    }

    this.world.addChild(props)



    this.buildWhiteboard()

    this.world.addChild(this.whiteboard)



    this.logBoard.onTap = () => this.onLogClick?.()

    this.world.addChild(this.logBoard)

    this.applyBoardTransforms()



    this.buildDust()

    this.world.addChild(this.dustLayer)

    this.world.addChild(this.backDeskLayer)

    this.world.addChild(this.backPonyLayer)

    this.world.addChild(this.frontDeskLayer)

    this.world.addChild(this.frontPonyLayer)



    for (const slot of DESK_SLOTS) {

      const layer = slot.row === 'back' ? this.backDeskLayer : this.frontDeskLayer

      this.buildDesk(slot, layer)

    }



    this.buildHireDesk()

    this.world.addChild(this.hireDeskGroup)

  }



  private buildDesk(slot: DeskSlot, layer: Container): void {

    const { x, y, deskScale, index } = slot

    const w = 160 * deskScale

    const halfW = w / 2

    const legW = 10 * deskScale

    const desk = new Graphics()

    desk.roundRect(x - halfW, y - 58, w, 10, 5).fill(ENV.deskWood)

    desk.roundRect(x - halfW, y - 50, w, 3, 2).fill(ENV.deskWoodDark)

    desk.roundRect(x - halfW + 10, y - 48, legW, 48, 3).fill(ENV.deskWoodDark)

    desk.roundRect(x + halfW - legW - 10, y - 48, legW, 48, 3).fill(ENV.deskWoodDark)

    desk.roundRect(x - 4, y - 82, 28 * deskScale, 20, 3).fill(0x5a4c3d)

    desk.roundRect(x - 8, y - 62, 36 * deskScale, 4, 2).fill(0x4a4036)

    layer.addChild(desk)



    const screen = new Graphics()

    screen.roundRect(x - 1, y - 78, 22 * deskScale, 14 * deskScale, 2).fill(0xf7f1e5)

    screen.alpha = 0.45

    this.deskScreens[index] = screen

    layer.addChild(screen)

  }



  private buildHireDesk(): void {

    const x = HIRE_DESK_X

    const y = 0

    const deskScale = 0.8

    const w = 160 * deskScale

    const halfW = w / 2

    const legW = 10 * deskScale



    const desk = new Graphics()

    desk.roundRect(x - halfW, y - 58, w, 10, 5).fill(ENV.deskWood)

    desk.roundRect(x - halfW, y - 50, w, 3, 2).fill(ENV.deskWoodDark)

    desk.roundRect(x - halfW + 10, y - 48, legW, 48, 3).fill(ENV.deskWoodDark)

    desk.roundRect(x + halfW - legW - 10, y - 48, legW, 48, 3).fill(ENV.deskWoodDark)



    const signPost = new Graphics()

    signPost.roundRect(x - 36, y - 118, 72, 52, 6).fill(ENV.deskWood)

    signPost.roundRect(x - 32, y - 112, 64, 40, 4).fill(ENV.whiteboard)



    this.hireSignLabel = new Text({

      text: '招聘处',

      style: {

        fontFamily: '"Microsoft YaHei", sans-serif',

        fontSize: 13,

        fill: ENV.textDark,

        fontWeight: '600'

      }

    })

    this.hireSignLabel.anchor.set(0.5)

    this.hireSignLabel.position.set(x, y - 92)



    this.hireReception = new PonyActor(HIRE_RECEPTION_PONY)

    this.hireReception.scale.set(0.88)

    this.hireReception.position.set(x, y)

    this.hireReception.eventMode = 'none'



    this.hireDeskGroup.addChild(desk, signPost, this.hireSignLabel, this.hireReception)

    this.hireDeskGroup.eventMode = 'static'

    this.hireDeskGroup.cursor = 'pointer'

    this.hireDeskGroup.on('pointertap', () => {

      if (this.hireAvailable) this.onHireClick?.()

    })

  }



  setHireAvailable(available: boolean): void {

    this.hireAvailable = available

    this.hireSignLabel.text = available ? '招聘处' : '满员'

    this.hireDeskGroup.alpha = available ? 1 : 0.55

    this.hireDeskGroup.cursor = available ? 'pointer' : 'default'

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



  private drawCeilingLamps(): void {

    this.ceilingGfx.clear()

    for (const child of [...this.lampHaloLayer.children]) child.destroy()

    this.lampHaloLayer.removeChildren()

    this.lampHalos = []



    const h = this.app.screen.height

    const scale = this.layoutScale

    const floorY = this.layoutFloorY

    const originY = this.layoutOriginY

    const whiteboardTop = originY + WALL_BOARD_TOP * scale

    const lampHeadY = Math.min(h * 0.16, floorY - 320 * scale, whiteboardTop - 24 * scale)



    for (const lx of LAMP_XS) {

      const screenX = this.world.position.x + lx * scale

      this.ceilingGfx.rect(screenX - 1.5, 0, 3, lampHeadY).fill(0x8a6f4d)

      this.ceilingGfx

        .moveTo(screenX - 22, lampHeadY + 8)

        .arcTo(screenX, lampHeadY - 18, screenX + 22, lampHeadY + 8, 24)

        .lineTo(screenX + 22, lampHeadY + 8)

        .fill(ENV.brass)

      this.ceilingGfx.circle(screenX, lampHeadY + 14, 6).fill({ color: 0xffe9b8, alpha: 0.95 })



      const halo = new Graphics()

      halo.circle(screenX, lampHeadY + 16, 22).fill({ color: 0xffe9b8, alpha: 0.1 })

      this.lampHalos.push(halo)

      this.lampHaloLayer.addChild(halo)

    }

  }



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



  setDeskActive(id: PonyId, on: boolean): void {

    const idx = this.ponyDeskIndex.get(id)

    if (idx == null) return

    if (on) {

      this.activeDesks.add(idx)

    } else {

      this.activeDesks.delete(idx)

      const screen = this.deskScreens[idx]

      if (screen) {

        screen.alpha = 0.45

        screen.tint = 0xffffff

      }

    }

  }



  private buildWhiteboard(): void {

    const w = LOG_BOARD_W

    const h = LOG_BOARD_H

    const board = new Graphics()

    board.roundRect(-w / 2, -h / 2, w, h, 8).fill(ENV.whiteboard)

    board.roundRect(-w / 2, -h / 2, w, h, 8).stroke({ width: 3, color: ENV.brass })

    board.roundRect(-w / 2 + 14, -h / 2 + 34, w - 98, 6, 3).fill({ color: 0xd9cbb5 })

    board.roundRect(-w / 2 + 14, -h / 2 + 48, w - 28, 5, 2.5).fill({ color: 0xe5dac6 })

    board.roundRect(-w / 2 + 14, -h / 2 + 62, w - 56, 5, 2.5).fill({ color: 0xe5dac6 })



    const label = new Text({

      text: '报告白板',

      style: {

        fontFamily: '"Microsoft YaHei", sans-serif',

        fontSize: 12,

        fill: ENV.textDark,

        fontWeight: '600'

      }

    })

    label.anchor.set(0.5, 0)

    label.position.set(0, -h / 2 + 8)

    label.alpha = 0.75



    this.whiteboard.addChild(board, label)

    this.whiteboard.eventMode = 'static'

    this.whiteboard.cursor = 'pointer'

    this.whiteboard.on('pointertap', () => this.onWhiteboardClick?.())

  }



  private layout(): void {

    const w = this.app.screen.width

    const h = this.app.screen.height

    const scale = Math.min(w / DESIGN_W, (h * 0.62) / DESIGN_H)

    const bottomPad = Math.max(20, h * 0.05)

    const originY = h - bottomPad

    const backY = originY - 88 * scale

    const floorY = backY - 36 * scale

    const floorH = h - floorY



    this.layoutScale = scale

    this.layoutFloorY = floorY

    this.layoutOriginY = originY



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

    for (let x = 60; x < w; x += 120) {

      this.bg.rect(x, floorY + 8, 2, floorH - 8).fill({ color: ENV.floorEdge, alpha: 0.35 })

    }



    this.world.scale.set(scale)

    const worldW = DESIGN_W * scale
    const chatReserve = Math.min(Math.max(this.rightReserve, 320), Math.max(320, w - 160))
    const originX = Math.max(16, (w - worldW - chatReserve) / 2)

    this.layoutOriginX = originX

    this.world.position.set(originX, originY)

    this.drawCeilingLamps()

    this.emitLayoutChange()

  }



  /** 白板内容区在画布上的屏幕矩形（供报告 HTML 预览叠层对齐） */
  getWhiteboardPreviewRect(): { x: number; y: number; width: number; height: number } {
    const frame = this.getBoardFrameRect('whiteboard')
    const padLeft = 18
    const padRight = 18
    const padTop = 22
    const padBottom = 18
    const state = this.boardStates.whiteboard
    const scaleX = this.layoutScale * state.scaleX
    const scaleY = this.layoutScale * state.scaleY
    const width = Math.max(8, frame.width - (padLeft + padRight) * scaleX)
    const height = Math.max(8, frame.height - (padTop + padBottom) * scaleY)
    return {
      x: frame.x + padLeft * scaleX,
      y: frame.y + padTop * scaleY,
      width,
      height
    }
  }

  getWhiteboardFrameRect(): { x: number; y: number; width: number; height: number } {
    return this.getBoardFrameRect('whiteboard')
  }

  getLogBoardFrameRect(): { x: number; y: number; width: number; height: number } {
    return this.getBoardFrameRect('log')
  }

  private getBoardFrameRect(kind: BoardKind): { x: number; y: number; width: number; height: number } {
    return this.getBoardFrameRectFromState(this.boardStates[kind])
  }

  private getBoardFrameRectFromState(state: BoardState): { x: number; y: number; width: number; height: number } {
    const scaleX = this.layoutScale * state.scaleX
    const scaleY = this.layoutScale * state.scaleY
    const width = LOG_BOARD_W * scaleX
    const height = LOG_BOARD_H * scaleY
    const centerX = state.baseX + state.offsetX
    const centerY = state.baseY + state.offsetY
    return {
      x: this.layoutOriginX + centerX * this.layoutScale - width / 2,
      y: this.layoutOriginY + centerY * this.layoutScale - height / 2,
      width,
      height
    }
  }



  addPony(pony: Pony, deskIndex: number, startX?: number, startY?: number): PonyActor {

    if (this.actors.has(pony.id)) this.removePony(pony.id)

    const slot = getDeskSlot(deskIndex)

    const actor = new PonyActor(pony)

    actor.homeX = slot.x

    actor.homeY = slot.y

    actor.scale.set(slot.ponyScale)

    actor.position.set(startX ?? slot.x, startY ?? slot.y)

    actor.on('pointertap', () => this.onPonyClick?.(pony.id))



    const layer = slot.row === 'back' ? this.backPonyLayer : this.frontPonyLayer

    layer.addChild(actor)

    this.actors.set(pony.id, actor)

    this.ponyDeskIndex.set(pony.id, deskIndex)

    return actor

  }



  removePony(id: PonyId): void {

    const actor = this.actors.get(id)

    if (!actor) return

    this.setDeskActive(id, false)

    actor.parent?.removeChild(actor)

    actor.destroy({ children: true })

    this.actors.delete(id)

    this.ponyDeskIndex.delete(id)

  }



  getPonyDeskIndex(id: PonyId): number | undefined {

    return this.ponyDeskIndex.get(id)

  }



  async relocatePony(id: PonyId, deskIndex: number, animated = true): Promise<void> {

    const actor = this.actors.get(id)

    if (!actor) return

    const currentIdx = this.ponyDeskIndex.get(id)

    if (currentIdx === deskIndex) return

    const slot = getDeskSlot(deskIndex)

    const layer = slot.row === 'back' ? this.backPonyLayer : this.frontPonyLayer

    actor.homeX = slot.x

    actor.homeY = slot.y

    actor.scale.set(slot.ponyScale)

    this.ponyDeskIndex.set(id, deskIndex)

    if (actor.parent !== layer) {

      actor.parent?.removeChild(actor)

      layer.addChild(actor)

    }

    if (animated) {

      await actor.walkTo(slot.x, slot.y)

    } else {

      actor.position.set(slot.x, slot.y)

    }

  }



  async playEntrance(pony: Pony, deskIndex: number): Promise<void> {

    if (this.destroyed) return

    const slot = getDeskSlot(deskIndex)

    const actor = this.addPony(pony, deskIndex, HIRE_DESK_X, 0)

    const layer = slot.row === 'back' ? this.backPonyLayer : this.frontPonyLayer

    const spot = new Graphics()

    spot.ellipse(0, -20, 52, 28).fill({ color: 0xffe9b8, alpha: 0.32 })

    spot.position.set(actor.x, actor.y - 8)

    layer.addChildAt(spot, 0)

    await actor.walkTo(actor.homeX, actor.homeY)

    if (this.destroyed) return

    await animate(700, (p) => {

      spot.alpha = 0.32 * (1 - p)

    })

    if (this.destroyed) return

    spot.destroy({ children: true })

    await actor.say(`大家好，我是${pony.name}！`, 2000)

  }



  async playDismissal(id: PonyId): Promise<void> {

    if (this.destroyed) return

    const actor = this.actors.get(id)

    if (!actor) return

    actor.eventMode = 'none'

    actor.cursor = 'default'

    await actor.say('再见！', 1100)

    if (this.destroyed) return

    const startX = actor.x

    const startAlpha = actor.alpha

    await animate(700, (p) => {

      actor.x = startX - 90 * p

      actor.alpha = startAlpha * (1 - p)

    })

    if (this.destroyed) return

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

    return this.getDeskPosition(id).x

  }



  getDeskPosition(id: PonyId): { x: number; y: number } {

    const actor = this.actors.get(id)

    if (actor) return { x: actor.homeX, y: actor.homeY }

    const idx = this.ponyDeskIndex.get(id)

    if (idx != null) {

      const slot = getDeskSlot(idx)

      return { x: slot.x, y: slot.y }

    }

    return { x: DESK_SLOTS[0].x, y: 0 }

  }



  getWhiteboardX(): number {

    return WHITEBOARD_X - 100

  }



  async pinReport(_title: string): Promise<void> {

    this.reportPinCount++

    const { scaleX: baseScaleX, scaleY: baseScaleY } = this.boardStates.whiteboard

    await animate(320, (p) => {

      const pulse = 1 + Math.sin(p * Math.PI) * 0.035

      this.whiteboard.scale.set(baseScaleX * pulse, baseScaleY * pulse)

    })

    this.whiteboard.scale.set(baseScaleX, baseScaleY)

  }



  clearPin(): void {

    this.reportPinCount = 0

  }



  syncReportPin(count: number, latestTitle?: string): void {

    this.clearPin()

    if (count <= 0 || !latestTitle) return

    this.reportPinCount = count - 1

    void this.pinReport(latestTitle)

  }



  get isDestroyed(): boolean {

    return this.destroyed

  }



  destroy(): void {

    if (this.destroyed) return

    this.destroyed = true

    cancelAllTweens()

    this.onLayoutChange = null

    this.onWhiteboardClick = null

    this.onPonyClick = null

    this.onHireClick = null

    this.onLogClick = null

    this.app.renderer.off('resize', this.onResize)

    this.app.destroy(true, { children: true })
  }
}
