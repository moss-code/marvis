import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Skill, SkillAsset, SkillReference, SkillScript } from '../../shared/types'
import { getSkillsDir } from '../workspace'
import {
  frontmatterFromMeta,
  isValidSkillDirName,
  parseFrontmatter,
  serializeSkillFile,
  SKILL_FILENAME,
  SKILL_IGNORED_DIR_PREFIXES,
  SKILL_REFERENCE_EXTENSIONS,
  SKILL_REFERENCE_FILES,
  SKILL_SCRIPT_EXTENSIONS,
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
        const rel = relative(scriptsDir, full).replace(/\\/g, '/')
        const base = rel.split('/').pop() ?? rel
        if (base === '__init__.py' || base.startsWith('__')) continue
        const ext = base.includes('.') ? `.${base.split('.').pop()!.toLowerCase()}` : ''
        if (!SKILL_SCRIPT_EXTENSIONS.has(ext)) continue
        scripts.push({ file: rel })
      }
    }
  }
  walk(scriptsDir)
  return scripts.sort((a, b) => a.file.localeCompare(b.file))
}

function isReferenceTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return SKILL_REFERENCE_EXTENSIONS.has(lower.slice(dot))
}

/** agentskills.io 渐进式披露：扫描参考文件路径，不预读正文 */
function discoverReferences(dir: string): SkillReference[] {
  const refs: SkillReference[] = []
  const seen = new Set<string>()

  const add = (relPath: string): void => {
    const norm = relPath.replace(/\\/g, '/')
    if (!norm || norm === SKILL_FILENAME || seen.has(norm)) return
    seen.add(norm)
    refs.push({ name: norm })
  }

  for (const fname of SKILL_REFERENCE_FILES) {
    if (existsSync(join(dir, fname))) add(fname)
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === SKILL_FILENAME) continue
    if (isReferenceTextFile(entry.name)) add(entry.name)
  }

  const refsDir = join(dir, 'references')
  if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    const walk = (current: string): void => {
      for (const name of readdirSync(current)) {
        const full = join(current, name)
        const st = statSync(full)
        if (st.isDirectory()) {
          walk(full)
        } else if (st.isFile() && isReferenceTextFile(name)) {
          add(relative(dir, full).replace(/\\/g, '/'))
        }
      }
    }
    walk(refsDir)
  }

  return refs.sort((a, b) => a.name.localeCompare(b.name))
}

function discoverAssets(dir: string): SkillAsset[] {
  const assetsDir = join(dir, 'assets')
  if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) return []

  const assets: SkillAsset[] = []
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
      } else if (st.isFile()) {
        assets.push({ file: relative(assetsDir, full).replace(/\\/g, '/') })
      }
    }
  }
  walk(assetsDir)
  return assets.sort((a, b) => a.file.localeCompare(b.file))
}

/** 执行阶段按需读取参考文件（带路径安全校验） */
export function loadSkillReferenceContent(skillId: string, file: string): string {
  const skillRoot = resolve(skillDir(skillId))
  const target = resolve(skillRoot, file)
  const rel = relative(skillRoot, target)
  if (rel.startsWith('..') || rel.includes('..\\') || rel.includes('../')) {
    throw new Error('参考文件路径非法')
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`参考文件不存在：${file}`)
  }
  if (!isReferenceTextFile(file)) {
    throw new Error(`不支持的参考文件类型：${file}`)
  }
  return readFileSync(target, 'utf8').trim()
}

function readSkillFromDir(id: string): Skill | null {
  const dir = skillDir(id)
  const path = skillFilePath(id)
  if (!existsSync(path)) return null

  const raw = readFileSync(path, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const fm = frontmatterFromMeta(meta)
  const st = statSync(path)
  const references = discoverReferences(dir)
  const scripts = readScripts(dir)
  const assets = discoverAssets(dir)

  return {
    id,
    name: fm.name || id,
    description: fm.description,
    markdown: body,
    builtin: false,
    updatedAt: st.mtimeMs,
    path: id,
    references: references.length > 0 ? references : undefined,
    scripts: scripts.length > 0 ? scripts : undefined,
    assets: assets.length > 0 ? assets : undefined
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
