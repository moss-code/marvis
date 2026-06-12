/** Cursor create-skill 兼容的 Skill 目录规范 */

export const SKILL_FILENAME = 'SKILL.md'

/** 注入 prompt 时一并附带的可选参考文件（按顺序） */
export const SKILL_REFERENCE_FILES = ['reference.md', 'examples.md'] as const

/** 扫描时忽略的目录名前缀 */
export const SKILL_IGNORED_DIR_PREFIXES = ['.', '_'] as const

export interface SkillFrontmatter {
  name: string
  description: string
  disableModelInvocation?: boolean
}

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw.trim() }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf(':')
    if (i > 0) meta[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim()
  }
  return { meta, body: match[2].trim() }
}

export function frontmatterFromMeta(meta: Record<string, string>): SkillFrontmatter {
  const disableRaw = meta['disable-model-invocation']
  return {
    name: meta.name ?? '',
    description: meta.description ?? '',
    disableModelInvocation:
      disableRaw === undefined ? true : !/^(false|0|no)$/i.test(disableRaw)
  }
}

export function serializeSkillFile(input: SkillFrontmatter & { markdown: string }): string {
  const lines = [
    '---',
    `name: ${input.name}`,
    `description: ${input.description}`,
    `disable-model-invocation: ${input.disableModelInvocation === false ? 'false' : 'true'}`,
    '---',
    '',
    input.markdown
  ]
  return lines.join('\n')
}

export function isValidSkillDirName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(name)
}

export function slugifySkillId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug && isValidSkillDirName(slug) ? slug : ''
}
