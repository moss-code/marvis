import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Skill, SkillReference, SkillScript } from '../../shared/types'
import { getSkillsDir } from '../workspace'
import {
  frontmatterFromMeta,
  isValidSkillDirName,
  parseFrontmatter,
  serializeSkillFile,
  SKILL_FILENAME,
  SKILL_IGNORED_DIR_PREFIXES,
  SKILL_REFERENCE_FILES,
  slugifySkillId
} from './format'

function shouldIgnoreDir(name: string): boolean {
  return SKILL_IGNORED_DIR_PREFIXES.some((p) => name.startsWith(p))
}

function skillDir(id: string): string {
  return join(getSkillsDir(), id)
}

function skillFilePath(id: string): string {
  return join(skillDir(id), SKILL_FILENAME)
}

function readScripts(dir: string): SkillScript[] {
  const scriptsDir = join(dir, 'scripts')
  if (!existsSync(scriptsDir)) return []
  if (!statSync(scriptsDir).isDirectory()) {
    console.warn(`[skills] scripts 不是目录，跳过：${scriptsDir}`)
    return []
  }

  const scripts: SkillScript[] = []
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
      } else if (st.isFile()) {
        scripts.push({ file: relative(scriptsDir, full).replace(/\\/g, '/') })
      }
    }
  }
  walk(scriptsDir)
  return scripts.sort((a, b) => a.file.localeCompare(b.file))
}

function readReferences(dir: string): SkillReference[] {
  const refs: SkillReference[] = []
  for (const fname of SKILL_REFERENCE_FILES) {
    const path = join(dir, fname)
    if (!existsSync(path)) continue
    refs.push({ name: fname, content: readFileSync(path, 'utf8').trim() })
  }
  return refs
}

function readSkillFromDir(id: string): Skill | null {
  const dir = skillDir(id)
  const path = skillFilePath(id)
  if (!existsSync(path)) return null

  const raw = readFileSync(path, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const fm = frontmatterFromMeta(meta)
  const st = statSync(path)
  const references = readReferences(dir)
  const scripts = readScripts(dir)

  return {
    id,
    name: fm.name || id,
    description: fm.description,
    markdown: body,
    builtin: false,
    updatedAt: st.mtimeMs,
    path: id,
    references: references.length > 0 ? references : undefined,
    scripts: scripts.length > 0 ? scripts : undefined
  }
}

/** 旧版扁平 skills/<id>.md → skills/<id>/SKILL.md */
export function migrateLegacyFlatSkillFiles(): void {
  const dir = getSkillsDir()
  if (!existsSync(dir)) return

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue
    const id = file.replace(/\.md$/, '')
    if (!isValidSkillDirName(id)) continue

    const legacyPath = join(dir, file)
    const nextPath = skillFilePath(id)
    if (existsSync(nextPath)) {
      unlinkIfExists(legacyPath)
      continue
    }

    mkdirSync(skillDir(id), { recursive: true })
    writeFileSync(nextPath, readFileSync(legacyPath, 'utf8'), 'utf8')
    unlinkIfExists(legacyPath)
  }
}

function unlinkIfExists(path: string): void {
  if (existsSync(path)) rmSync(path)
}

/** 确保工作区 skills/ 下有格式说明（首次创建目录时写入） */
export function ensureSkillsReadme(): void {
  const dir = getSkillsDir()
  const readme = join(dir, 'README.md')
  if (existsSync(readme)) return

  writeFileSync(
    readme,
    `# Skill 目录说明

本目录遵循 [Cursor Agent Skill](https://cursor.com/docs/agent/skills) 规范，可直接从外部批量复制成熟 Skill 目录。

## 目录结构

\`\`\`
skills/
├── README.md                 # 本说明
├── my-skill/                 # 每个 Skill 一个子目录（目录名 = skill id）
│   ├── SKILL.md              # 必需：YAML frontmatter + 指令正文
│   ├── reference.md          # 可选：详细参考
│   ├── examples.md           # 可选：示例
│   └── scripts/              # 可选：脚本库（小马通过 run_skill_script 执行，可联网）
└── another-skill/
    └── SKILL.md
\`\`\`

## SKILL.md frontmatter

\`\`\`yaml
---
name: my-skill
description: 一句话说明用途与触发场景（第三人称）
disable-model-invocation: true
---
\`\`\`

复制外部 Skill 后重启应用或打开设置页即可自动扫描。预置 Skill 仍在应用数据库中，与本目录无关。
`,
    'utf8'
  )
}

/** 扫描工作区 skills/ 目录（自定义 Skill 唯一事实源） */
export function listWorkspaceSkills(): Skill[] {
  migrateLegacyFlatSkillFiles()
  ensureSkillsReadme()

  const dir = getSkillsDir()
  if (!existsSync(dir)) return []

  const skills: Skill[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || shouldIgnoreDir(entry.name)) continue
    if (!isValidSkillDirName(entry.name)) {
      console.warn(`[skills] 跳过无效目录名：${entry.name}`)
      continue
    }
    try {
      const skill = readSkillFromDir(entry.name)
      if (skill) skills.push(skill)
    } catch (err) {
      console.error(`[skills] 跳过无效 Skill 目录 ${entry.name}:`, err)
    }
  }
  return skills
}

export function getWorkspaceSkill(id: string): Skill | null {
  migrateLegacyFlatSkillFiles()
  return readSkillFromDir(id)
}

export function saveWorkspaceSkill(input: {
  id?: string
  name: string
  description: string
  markdown: string
}): Skill {
  const name = input.name.trim()
  const description = input.description.trim()
  if (!name) throw new Error('Skill 名称不能为空')

  migrateLegacyFlatSkillFiles()
  ensureSkillsReadme()

  let id = input.id?.trim()
  if (id) {
    if (!isValidSkillDirName(id)) throw new Error(`Skill 目录名不合法：${id}`)
    if (!existsSync(skillFilePath(id))) {
      throw new Error(`工作区中不存在 Skill 目录：${id}`)
    }
  } else {
    id = slugifySkillId(name) || `skill-${randomUUID().slice(0, 8)}`
    if (existsSync(skillDir(id))) {
      id = `skill-${randomUUID().slice(0, 8)}`
    }
  }

  const dir = skillDir(id)
  mkdirSync(dir, { recursive: true })

  const payload = serializeSkillFile({
    name,
    description,
    markdown: input.markdown,
    disableModelInvocation: true
  })
  writeFileSync(skillFilePath(id), payload, 'utf8')

  return readSkillFromDir(id)!
}

export function deleteWorkspaceSkill(id: string): void {
  const dir = skillDir(id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })

  const legacy = join(getSkillsDir(), `${id}.md`)
  unlinkIfExists(legacy)
}

/** 将旧版 DB 中的自定义 Skill 迁移到工作区（幂等） */
export function migrateCustomSkillsFromDb(
  rows: { id: string; json: string }[],
  onMigrated: (id: string) => void
): void {
  migrateLegacyFlatSkillFiles()
  ensureSkillsReadme()

  for (const row of rows) {
    const skill = JSON.parse(row.json) as Skill
    if (skill.builtin) continue
    if (existsSync(skillFilePath(skill.id))) {
      onMigrated(skill.id)
      continue
    }

    let id = skill.id
    if (!isValidSkillDirName(id)) {
      id = slugifySkillId(skill.name) || `skill-${randomUUID().slice(0, 8)}`
    }
    if (existsSync(skillDir(id))) {
      id = `skill-${randomUUID().slice(0, 8)}`
    }

    mkdirSync(skillDir(id), { recursive: true })
    writeFileSync(
      skillFilePath(id),
      serializeSkillFile({
        name: skill.name,
        description: skill.description,
        markdown: skill.markdown,
        disableModelInvocation: true
      }),
      'utf8'
    )
    onMigrated(skill.id)
  }
}

/** 重新扫描工作区 Skill（批量导入后调用） */
export function rescanWorkspaceSkills(): Skill[] {
  return listWorkspaceSkills()
}
