import { useEffect, useRef, type RefObject } from 'react'

/** 挂载时瞬间滚到底部；之后随 deps 变化平滑跟随（避免切页时从上滑到底的动画） */
export function useChatScrollToBottom(
  listRef: RefObject<HTMLDivElement | null>,
  deps: readonly unknown[]
): void {
  const bootstrapped = useRef(false)

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    if (!bootstrapped.current) {
      bootstrapped.current = true
      el.scrollTop = el.scrollHeight
      return
    }

    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, deps)
}
