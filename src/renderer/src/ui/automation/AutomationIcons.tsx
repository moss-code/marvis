import type { AutomationTemplateIcon } from '@shared/types'

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

export function AutomationClockIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function AutomationTemplateIconGlyph({ icon }: { icon: AutomationTemplateIcon }): React.JSX.Element {
  switch (icon) {
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 16V11" />
          <path d="M12 16V8" />
          <path d="M16 16V13" />
        </svg>
      )
    case 'users':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
          <circle cx="9" cy="9" r="3" />
          <path d="M3.5 19c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5" />
          <circle cx="16.5" cy="10" r="2.2" />
          <path d="M14.5 19c.5-1.8 1.8-2.8 3.5-2.8" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
          <path d="M12 3.5 18 6v5.5c0 4-2.6 7.2-6 8.5-3.4-1.3-6-4.5-6-8.5V6l6-2.5z" />
          <path d="m9.5 12 1.8 1.8 3.7-3.8" />
        </svg>
      )
    case 'invoice':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
          <path d="M7 4h10v16H7z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      )
    case 'audit':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      )
    case 'reminder':
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
          <path d="M5 10a7 7 0 0 1 14 0c0 4-2 5.5-2 5.5H7S5 14 5 10z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      )
    default:
      return <AutomationClockIcon />
  }
}
