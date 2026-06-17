import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { SlashBindState } from '@/ui/ComposerSessionBindings'

interface SlashItem {
  kind: 'skill' | 'mcp'
  id: string
  label: string
  meta: string
}

export function useJobSlashBind(
  text: string,
  setText: (value: string) => void,
  onBindSkill: (id: string) => void,
  onBindMcp: (id: string) => void
): SlashBindState {
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const [activeIndex, setActiveIndex] = useState(0)

  const slashMatch = text.match(/(?:^|\s)\/(\S*)$/)
  const open = slashMatch !== null
  const query = (slashMatch?.[1] ?? '').trim().toLowerCase()

  const items = useMemo(() => {
    const all: SlashItem[] = [
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

  const selectItem = (item: SlashItem): void => {
    if (item.kind === 'skill') onBindSkill(item.id)
    else onBindMcp(item.id)
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
