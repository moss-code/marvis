import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Skill, SkillsShCatalogItem, SkillsShInstallResult } from '../../shared/types'
import { logError, logInfo } from '../logger'
import { getRuntimeProcessEnv, resolveExecutable } from '../runtimeEnv'
import { getSkillsDir } from '../workspace'
import { isValidSkillDirName, SKILL_FILENAME } from './format'
import { listWorkspaceSkills } from './index'

const SKILLS_SH_SEARCH = 'https://www.skills.sh/api/search'
const INSTALL_TIMEOUT_MS = 180_000

function githubRepoUrl(source: string): string {
  const parts = source.trim().split('/').filter(Boolean)
  if (parts.length < 2) throw new Error(`无效的 GitHub 来源：${source}`)
  return `https://github.com/${parts[0]}/${parts[1]}`
}

function skillsShDetailUrl(id: string, source: string): string {
  const slug = id.trim() || source.trim()
  return `https://skills.sh/${slug}`
}

function parseSearchResponse(raw: unknown, query: string): SkillsShCatalogItem[] {
  if (!raw || typeof raw !== 'object') throw new Error('skills.sh 返回格式异常')
  const body = raw as { skills?: unknown }
  if (!Array.isArray(body.skills)) throw new Error('skills.sh 返回格式异常')

  const items: SkillsShCatalogItem[] = []
  for (const row of body.skills) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const source = String(r.source ?? '').trim()
    const skillId = String(r.skillId ?? r.name ?? '').trim()
    if (!source || !skillId) continue
    items.push({
      id: String(r.id ?? `${source}/${skillId}`).trim(),
      skillId,
      name: String(r.name ?? skillId).trim(),
      installs: typeof r.installs === 'number' ? r.installs : 0,
      source
    })
  }

  if (items.length === 0 && query.trim()) {
    throw new Error(`未找到与「${query.trim()}」相关的 Skill`)
  }
  return items
}

/** 搜索 skills.sh 目录（https://www.skills.sh/api/search） */
export async function searchSkillsSh(query: string, limit = 50): Promise<SkillsShCatalogItem[]> {
  const q = query.trim()
  if (!q) throw new Error('请输入搜索关键词')

  const url = `${SKILLS_SH_SEARCH}?q=${encodeURIComponent(q)}&limit=${Math.min(Math.max(limit, 1), 100)}`
  logInfo('skills-sh', '搜索 Skill', { q, limit })

  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`skills.sh 搜索失败（HTTP ${res.status}）`)
  }

  const json: unknown = await res.json()
  return parseSearchResponse(json, q)
}

function runSkillsAdd(cwd: string, source: string, skillId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = getRuntimeProcessEnv()
    env.CI = '1'
    const npx = resolveExecutable('npx', env)
    const args = [
      '--yes',
      'skills',
      'add',
      source,
      '--skill',
      skillId,
      '--copy',
      '-y',
      '-a',
      'openclaw'
    ]

    logInfo('skills-sh', '执行 npx skills add', { source, skillId, cwd })

    const child = spawn(npx, args, {
      cwd,
      env,
      windowsHide: true,
      shell: process.platform === 'win32'
    })

    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('安装超时（3 分钟），请检查网络或稍后重试'))
    }, INSTALL_TIMEOUT_MS)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      const tail = stderr.trim().slice(-600)
      reject(
        new Error(
          `npx skills add 失败（退出码 ${code ?? '?'}）${tail ? `：${tail}` : ''}`
        )
      )
    })
  })
}

function findInstalledSkillDir(stagingRoot: string): string {
  const skillsRoot = join(stagingRoot, 'skills')
  if (!existsSync(skillsRoot)) {
    throw new Error('安装完成但未找到 skills/ 目录，请确认本机已安装 Node.js 且 npx 可用')
  }

  const dirs = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => join(skillsRoot, e.name))
    .filter((dir) => existsSync(join(dir, SKILL_FILENAME)))

  if (dirs.length === 0) {
    throw new Error('安装完成但未找到有效的 SKILL.md')
  }
  if (dirs.length > 1) {
    throw new Error('安装了多个 Skill 目录，请一次只安装一个')
  }
  return dirs[0]!
}

function copySkillToWorkspace(srcDir: string, skillId: string): Skill {
  const folderName = srcDir.split(/[/\\]/).pop() ?? skillId
  const targetId = isValidSkillDirName(folderName)
    ? folderName
    : isValidSkillDirName(skillId)
      ? skillId
      : null

  if (!targetId) {
    throw new Error(`Skill 目录名不合法：${folderName}`)
  }

  const dest = join(getSkillsDir(), targetId)
  if (existsSync(dest)) {
    throw new Error(`工作区已存在 Skill「${targetId}」，请先删除后再安装`)
  }

  cpSync(srcDir, dest, { recursive: true })
  const skill = listWorkspaceSkills().find((s) => s.id === targetId)
  if (!skill) {
    throw new Error(`Skill 已复制但扫描失败：${targetId}`)
  }
  return skill
}

/** 从 skills.sh 来源（owner/repo + skillId）安装到小马工作区 skills/ */
export async function installSkillFromSkillsSh(input: {
  source: string
  skillId: string
  id?: string
}): Promise<SkillsShInstallResult> {
  const source = input.source.trim()
  const skillId = input.skillId.trim()
  if (!source || !skillId) throw new Error('缺少 source 或 skillId')

  const stagingRoot = mkdtempSync(join(tmpdir(), 'pony-skills-'))
  try {
    await runSkillsAdd(stagingRoot, source, skillId)
    const installedDir = findInstalledSkillDir(stagingRoot)
    const skill = copySkillToWorkspace(installedDir, skillId)
    logInfo('skills-sh', 'Skill 安装成功', { id: skill.id, source, skillId })
    return {
      skill,
      githubUrl: githubRepoUrl(source),
      skillsShUrl: skillsShDetailUrl(input.id ?? `${source}/${skillId}`, source)
    }
  } catch (err) {
    logError('skills-sh', 'Skill 安装失败', err)
    throw err
  } finally {
    try {
      rmSync(stagingRoot, { recursive: true, force: true })
    } catch {
      /* ignore cleanup errors */
    }
  }
}
