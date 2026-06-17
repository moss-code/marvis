import type { AutomationJobTemplate } from '@shared/types'
import { AutomationTemplateIconGlyph } from '@/ui/automation/AutomationIcons'

interface AutomationTemplateCardProps {
  template: AutomationJobTemplate
  onUse(): void
}

export function AutomationTemplateCard({ template, onUse }: AutomationTemplateCardProps): React.JSX.Element {
  return (
    <article className="automation-template-card">
      <span className="automation-template-icon" aria-hidden="true">
        <AutomationTemplateIconGlyph icon={template.icon ?? 'chart'} />
      </span>
      <div className="automation-template-copy">
        <strong>{template.name}</strong>
        <p>{template.description}</p>
      </div>
      <button type="button" className="automation-template-use" onClick={onUse}>
        使用
      </button>
    </article>
  )
}
