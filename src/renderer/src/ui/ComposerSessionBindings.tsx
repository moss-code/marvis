import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store/appStore'

export interface SlashBindState {
  open: boolean
  query: string
  activeIndex: number
  setActiveIndex(index: number): void
  items: SlashBindItem[]
  selectItem(item: SlashBindItem): void
  onKeyDown(event: React.KeyboardEvent): boolean
  close(): void
}

interface SlashBindItem {
  kind: 'skill' | 'mcp'
  id: string
  label: string
  meta: string
}

export function useSlashBind(
  text: string,
  setText: (value: string) => void,
  disabled: boolean
): SlashBindState {
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const bindSessionSkill = useAppStore((s) => s.bindSessionSkill)
  const bindSessionMcp = useAppStore((s) => s.bindSessionMcp)
  const [activeIndex, setActiveIndex] = useState(0)

  const slashMatch = disabled ? null : text.match(/(?:^|\s)\/(\S*)$/)
  const open = slashMatch !== null
  const query = (slashMatch?.[1] ?? '').trim().toLowerCase()

  const items = useMemo(() => {
    const all: SlashBindItem[] = [
      ...skills.map((skill) => ({
        kind: 'skill' as const,
        id: skill.id,
        label: skill.name,
        meta: skill.description || skill.id
      })),
      ...mcpServers.map((server) => ({
        kind: 'mcp' as const,
        id: server.id,
        label: server.name,
        meta: server.spec.url ?? server.spec.command ?? server.id
      }))
    ]
    if (!query) return all
    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.meta.toLowerCase().includes(query)
    )
  }, [skills, mcpServers, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  const close = (): void => {
    if (!slashMatch) return
    setText(text.replace(/(?:^|\s)\/\S*$/, (match) => (match.startsWith(' ') ? ' ' : '')).trimEnd())
  }

  const selectItem = (item: SlashBindItem): void => {
    if (item.kind === 'skill') bindSessionSkill(item.id)
    else bindSessionMcp(item.id)
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent): boolean => {
    if (!open || items.length === 0) return false
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % items.length)
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + items.length) % items.length)
      return true
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) selectItem(item)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }
    return false
  }

  return { open, query, activeIndex, setActiveIndex, items, selectItem, onKeyDown, close }
}

export function SessionBindingChips({
  disabled
}: {
  disabled?: boolean
}): React.JSX.Element | null {
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const sessionSkillIds = useAppStore((s) => s.sessionSkillIds)
  const sessionMcpServerIds = useAppStore((s) => s.sessionMcpServerIds)
  const unbindSessionSkill = useAppStore((s) => s.unbindSessionSkill)
  const unbindSessionMcp = useAppStore((s) => s.unbindSessionMcp)

  if (sessionSkillIds.length === 0 && sessionMcpServerIds.length === 0) return null

  return (
    <div className="session-bind-chips">
      {sessionSkillIds.map((id) => {
        const skill = skills.find((s) => s.id === id)
        return (
          <span key={`skill-${id}`} className="chip chip-active chip-skill" title={skill?.description ?? id}>
            Skill · {skill?.name ?? id}
            <button
              type="button"
              className="chip-remove"
              disabled={disabled}
              aria-label={`移除 Skill ${skill?.name ?? id}`}
              onClick={() => unbindSessionSkill(id)}
            >
              ×
            </button>
          </span>
        )
      })}
      {sessionMcpServerIds.map((id) => {
        const server = mcpServers.find((m) => m.id === id)
        return (
          <span key={`mcp-${id}`} className="chip chip-active chip-mcp" title={server?.spec.url ?? server?.spec.command ?? id}>
            MCP · {server?.name ?? id}
            <button
              type="button"
              className="chip-remove"
              disabled={disabled}
              aria-label={`移除 MCP ${server?.name ?? id}`}
              onClick={() => unbindSessionMcp(id)}
            >
              ×
            </button>
          </span>
        )
      })}
    </div>
  )
}

function useSlashMenuPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>
): React.CSSProperties | null {
  const [style, setStyle] = useState<React.CSSProperties | null>(null)

  useEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }

    const update = (): void => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const gap = 8
      const spaceAbove = rect.top - gap - 12
      const spaceBelow = window.innerHeight - rect.bottom - gap - 12
      const maxHeight = Math.min(280, Math.max(120, Math.max(spaceAbove, spaceBelow)))
      if (spaceAbove >= 120 || spaceAbove >= spaceBelow) {
        setStyle({
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          bottom: window.innerHeight - rect.top + gap,
          maxHeight: Math.min(maxHeight, spaceAbove),
          zIndex: 2147483003
        })
      } else {
        setStyle({
          position: 'fixed',
          left: rect.left,
          width: rect.width,
          top: rect.bottom + gap,
          maxHeight: Math.min(maxHeight, spaceBelow),
          zIndex: 2147483003
        })
      }
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  return style
}

export function SlashBindMenu({
  slash,
  disabled,
  anchorRef
}: {
  slash: SlashBindState
  disabled?: boolean
  anchorRef: RefObject<HTMLElement | null>
}): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const menuStyle = useSlashMenuPosition(slash.open, anchorRef)

  useEffect(() => {
    if (!slash.open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      slash.close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [slash, anchorRef])

  if (!slash.open || !menuStyle) return null

  return createPortal(
    <div
      className="slash-bind-menu slash-bind-menu--portal"
      ref={menuRef}
      style={menuStyle}
      role="listbox"
      aria-label="绑定 Skill 或 MCP"
    >
      <div className="slash-bind-head">
        <strong>绑定 Skill / MCP</strong>
        <small>输入 / 筛选，Enter 选择；发送前可挂多个</small>
      </div>
      {slash.items.length === 0 ? (
        <p className="slash-bind-empty">没有匹配项。请先在设置中配置 Skill 或 MCP。</p>
      ) : (
        <ul>
          {slash.items.map((item, index) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                className={index === slash.activeIndex ? 'active' : ''}
                disabled={disabled}
                role="option"
                aria-selected={index === slash.activeIndex}
                onMouseEnter={() => slash.setActiveIndex(index)}
                onClick={() => slash.selectItem(item)}
              >
                <span className={`slash-bind-kind ${item.kind}`}>{item.kind === 'skill' ? 'Skill' : 'MCP'}</span>
                <span className="slash-bind-label">
                  <strong>{item.label}</strong>
                  <small>{item.meta}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body
  )
}
