import { Container, Graphics, Text } from 'pixi.js'
import { LOG_BOARD_H, LOG_BOARD_W } from '@shared/office'
import type { LogLine, LogTone } from '@/ui/logLines'
import { ENV } from './palettes'
import { animate } from './tween'

const BOARD_W = LOG_BOARD_W
const BOARD_H = LOG_BOARD_H
const CONTENT_TOP = 34
const CONTENT_PAD_X = 14
const FONT_SIZE = 12
const ENTRY_GAP = 6
const MAX_LINES = 30

const TONE_FILL: Record<LogTone, number | string> = {
  normal: ENV.textDark,
  strong: ENV.textDark,
  dispatch: 0xc9a77c,
  error: 0x96523b,
  report: 0x8a9b6e
}

const LOG_TEXT_STYLE = {
  fontFamily: '"Microsoft YaHei", sans-serif',
  fontSize: FONT_SIZE,
  wordWrap: true,
  wordWrapWidth: BOARD_W - 28,
  breakWords: true
} as const

/** 后墙任务日志屏：动态滚动，点击打开完整日志模态 */
export class LogBoard extends Container {
  onTap: (() => void) | null = null

  private linesGroup = new Container()
  private emptyHint!: Text
  private lineCount = 0

  constructor() {
    super()
    this.build()
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointertap', () => this.onTap?.())
  }

  private build(): void {
    const frame = new Graphics()
    frame.roundRect(-BOARD_W / 2, -BOARD_H / 2, BOARD_W, BOARD_H, 8).fill(ENV.whiteboard)
    frame.roundRect(-BOARD_W / 2, -BOARD_H / 2, BOARD_W, BOARD_H, 8).stroke({ width: 3, color: ENV.brass })

    const title = new Text({
      text: '任务日志',
      style: {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: FONT_SIZE,
        fill: ENV.textDark,
        fontWeight: '600'
      }
    })
    title.anchor.set(0.5, 0)
    title.position.set(0, -BOARD_H / 2 + 8)
    title.alpha = 0.75

    const mask = new Graphics()
    mask.rect(-BOARD_W / 2 + 10, -BOARD_H / 2 + 28, BOARD_W - 20, BOARD_H - 38).fill(0xffffff)
    mask.eventMode = 'none'

    this.emptyHint = new Text({
      text: '等待任务…',
      style: {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: FONT_SIZE,
        fill: ENV.textDark,
        fontStyle: 'italic'
      }
    })
    this.emptyHint.alpha = 0.45
    this.emptyHint.anchor.set(0, 0)
    this.emptyHint.position.set(-BOARD_W / 2 + CONTENT_PAD_X, -BOARD_H / 2 + CONTENT_TOP)

    this.linesGroup.position.set(-BOARD_W / 2 + CONTENT_PAD_X, -BOARD_H / 2 + CONTENT_TOP)
    this.linesGroup.mask = mask

    this.addChild(frame, title, mask, this.emptyHint, this.linesGroup)
  }

  private reflowEntries(): void {
    let y = 0
    for (const child of this.linesGroup.children) {
      const row = child as Text
      row.position.y = y
      y += row.height + ENTRY_GAP
    }
  }

  push(line: LogLine): void {
    this.emptyHint.visible = false

    const row = new Text({
      text: line.text,
      style: {
        ...LOG_TEXT_STYLE,
        fill: TONE_FILL[line.tone],
        fontWeight: line.tone === 'strong' ? '600' : '400'
      }
    })
    row.resolution = 2
    row.alpha = 0
    this.linesGroup.addChildAt(row, 0)
    this.reflowEntries()
    this.linesGroup.y = -BOARD_H / 2 + CONTENT_TOP
    this.lineCount++

    void animate(160, (p) => {
      row.alpha = p
    })

    while (this.linesGroup.children.length > MAX_LINES) {
      const oldest = this.linesGroup.children[this.linesGroup.children.length - 1]
      this.linesGroup.removeChild(oldest)
      oldest.destroy()
      this.lineCount--
      this.reflowEntries()
    }
  }

  clear(): void {
    for (const child of [...this.linesGroup.children]) {
      child.destroy()
    }
    this.linesGroup.removeChildren()
    this.linesGroup.y = -BOARD_H / 2 + CONTENT_TOP
    this.lineCount = 0
    this.emptyHint.visible = true
  }
}
