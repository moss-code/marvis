import type { Skill } from '@shared/types'

/** Skill 列表/卡片上的脚本与参考文档徽标 */
export function SkillBadges({ skill }: { skill: Skill }): React.JSX.Element | null {
  const hasScripts = (skill.scripts?.length ?? 0) > 0
  const hasRefs = (skill.references?.length ?? 0) > 0
  if (!hasScripts && !hasRefs) return null
  return (
    <span className="skill-badges">
      {hasScripts && (
        <span className="skill-badge" title="该技能可执行本地脚本并联网">
          ⚙ 含脚本
        </span>
      )}
      {hasRefs && (
        <span className="skill-badge" title="含参考文档">
          📄 含参考文档
        </span>
      )}
    </span>
  )
}
