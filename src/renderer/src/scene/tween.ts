/** 轻量补间：由场景 Ticker 统一驱动 */

interface ActiveTween {
  elapsed: number
  duration: number
  update: (p: number) => void
  ease: (t: number) => number
  resolve: () => void
}

const active: ActiveTween[] = []

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const linear = (t: number): number => t

export function updateTweens(deltaMs: number): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i]
    tw.elapsed += deltaMs
    const p = Math.min(1, tw.elapsed / tw.duration)
    tw.update(tw.ease(p))
    if (p >= 1) {
      active.splice(i, 1)
      tw.resolve()
    }
  }
}

export function animate(
  duration: number,
  update: (p: number) => void,
  ease: (t: number) => number = easeInOut
): Promise<void> {
  return new Promise((resolve) => {
    active.push({ elapsed: 0, duration: Math.max(1, duration), update, ease, resolve })
  })
}

export function delay(ms: number): Promise<void> {
  return animate(ms, () => {}, linear)
}

/** 取消所有进行中的补间（场景销毁时调用，避免操作已释放的 Pixi 节点） */
export function cancelAllTweens(): void {
  const pending = active.splice(0)
  for (const tw of pending) tw.resolve()
}

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p
