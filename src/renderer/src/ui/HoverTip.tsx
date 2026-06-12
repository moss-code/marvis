import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TipPos = { left: number; top: number; maxWidth: number }

type HoverTipProps = {
  text: string
  className?: string
  children: ReactNode
  multiline?: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function HoverTip({ text, className, children, multiline = false }: HoverTipProps): React.JSX.Element {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [tip, setTip] = useState<TipPos | null>(null)

  const show = useCallback(() => {
    const el = triggerRef.current
    if (!el || !text.trim()) return

    const truncated = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
    if (!truncated && text.length <= 80) return

    const rect = el.getBoundingClientRect()
    const margin = 12
    const maxWidth = Math.min(520, window.innerWidth - margin * 2)
    const left = clamp(rect.left, margin, window.innerWidth - maxWidth - margin)
    const below = rect.bottom + 8
    const above = rect.top - 8
    const preferBelow = below + 160 < window.innerHeight
    setTip({
      left,
      top: preferBelow ? below : above,
      maxWidth
    })
  }, [text])

  const hide = useCallback(() => setTip(null), [])

  return (
    <>
      <span
        ref={triggerRef}
        className={`hover-tip-trigger${className ? ` ${className}` : ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        {children}
      </span>
      {tip &&
        createPortal(
          <div
            className={`hover-tip-popup${multiline ? ' hover-tip-popup--multiline' : ''}${tip.top < (triggerRef.current?.getBoundingClientRect().top ?? 0) ? ' hover-tip-popup--above' : ''}`}
            style={{ left: tip.left, top: tip.top, maxWidth: tip.maxWidth }}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  )
}
