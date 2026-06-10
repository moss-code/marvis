import { Container, Graphics, Text } from 'pixi.js'
import { ENV } from './palettes'
import { animate } from './tween'

/** 对话气泡：圆角卡片 + 小尾巴，亚麻底色黄铜描边 */
export class Bubble extends Container {
  constructor(text: string, tone: 'normal' | 'error' = 'normal') {
    super()
    const label = new Text({
      text,
      style: {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: 13,
        fill: tone === 'error' ? 0x96523b : ENV.textDark,
        wordWrap: true,
        wordWrapWidth: 190,
        breakWords: true,
        lineHeight: 19
      }
    })
    const padX = 14
    const padY = 10
    const w = Math.max(46, label.width + padX * 2)
    const h = label.height + padY * 2

    const bg = new Graphics()
    bg.roundRect(-w / 2, -h, w, h, 12).fill(ENV.bubbleBg)
    bg.roundRect(-w / 2, -h, w, h, 12).stroke({
      width: 1.5,
      color: tone === 'error' ? 0xc97d5e : ENV.bubbleBorder
    })
    // 尾巴
    bg.poly([-8, -1, 8, -1, 0, 12]).fill(ENV.bubbleBg)

    label.x = -w / 2 + padX
    label.y = -h + padY
    this.addChild(bg, label)
    this.alpha = 0
  }

  async show(holdMs: number): Promise<void> {
    await animate(160, (p) => {
      this.alpha = p
      this.scale.set(0.9 + 0.1 * p)
    })
    await new Promise((r) => setTimeout(r, holdMs))
    await animate(180, (p) => {
      this.alpha = 1 - p
    })
    this.destroy({ children: true })
  }
}
