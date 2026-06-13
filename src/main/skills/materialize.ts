import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { logInfo, logWarn } from '../logger'

const GIT_SYMLINK_MAX_BYTES = 512

/** Git 仓库内的符号链接在 Windows/--copy 下会变成单行相对路径文本文件 */
export function isGitSymlinkFile(filePath: string): boolean {
  try {
    const st = statSync(filePath)
    if (!st.isFile() || st.isSymbolicLink()) return false
    if (st.size > GIT_SYMLINK_MAX_BYTES) return false
    const content = readFileSync(filePath, 'utf8').trim()
    if (!content || content.includes('\n')) return false
    return /^(\.\.(\/|\\))+/.test(content) || /^[\w./\\-]+$/.test(content)
  } catch {
    return false
  }
}

/** 将 git symlink 文本解析为仓库内路径，如 ../../../src/foo → src/foo */
export function symlinkTextToRepoPath(linkText: string): string {
  const parts = linkText
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p !== '..' && p !== '.' && p.length > 0)
  return parts.join('/')
}

function parseGithubSource(source: string): { owner: string; repo: string } {
  const parts = source.trim().split('/').filter(Boolean)
  if (parts.length < 2) throw new Error(`无效的 GitHub 来源：${source}`)
  return { owner: parts[0]!, repo: parts[1]! }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pony-office'
    }
  })
  if (!res.ok) {
    throw new Error(`GitHub 请求失败（HTTP ${res.status}）：${url}`)
  }
  return (await res.json()) as T
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const data = await fetchJson<{ default_branch?: string }>(
    `https://api.github.com/repos/${owner}/${repo}`
  )
  return data.default_branch || 'main'
}

type GithubTreeItem = { path: string; type: string; sha: string }

async function listRepoBlobs(
  owner: string,
  repo: string,
  branch: string,
  repoPath: string
): Promise<{ path: string }[]> {
  const data = await fetchJson<{ tree?: GithubTreeItem[] }>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  )
  const tree = data.tree ?? []
  const normalized = repoPath.replace(/\\/g, '/').replace(/\/$/, '')
  const prefix = `${normalized}/`

  return tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        (item.path === normalized || item.path.startsWith(prefix))
    )
    .map((item) => ({ path: item.path }))
}

async function downloadBlob(
  owner: string,
  repo: string,
  branch: string,
  blobPath: string,
  destFile: string
): Promise<void> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${blobPath}`
  const res = await fetch(url, { headers: { 'User-Agent': 'pony-office' } })
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）：${blobPath}`)
  }
  mkdirSync(dirname(destFile), { recursive: true })
  writeFileSync(destFile, Buffer.from(await res.arrayBuffer()))
}

/** 从 GitHub 拉取仓库内某路径（文件或目录）到本地 */
export async function downloadGithubRepoPath(
  source: string,
  repoPath: string,
  destPath: string
): Promise<void> {
  const { owner, repo } = parseGithubSource(source)
  const branch = await getDefaultBranch(owner, repo)
  const blobs = await listRepoBlobs(owner, repo, branch, repoPath)

  if (blobs.length === 0) {
    throw new Error(`GitHub 仓库中未找到路径：${repoPath}`)
  }

  const normalized = repoPath.replace(/\\/g, '/').replace(/\/$/, '')
  const prefix = `${normalized}/`

  for (const blob of blobs) {
    const rel =
      blob.path === normalized
        ? blob.path.split('/').pop()!
        : blob.path.slice(prefix.length)
    await downloadBlob(owner, repo, branch, blob.path, join(destPath, rel))
  }
}

/**
 * 将 Skill 目录中的 git symlink 文本文件替换为 GitHub 上的真实内容。
 * npx skills add --copy 在 Windows 上常留下指向 repo 内其他路径的 1KB 文本「假文件夹」。
 */
export async function materializeGitSymlinksInSkill(
  skillDir: string,
  source: string
): Promise<void> {
  for (const name of readdirSync(skillDir)) {
    const entryPath = join(skillDir, name)
    if (!isGitSymlinkFile(entryPath)) continue

    const linkText = readFileSync(entryPath, 'utf8').trim()
    const repoPath = symlinkTextToRepoPath(linkText)
    if (!repoPath) {
      logWarn('skills-sh', `无法解析 symlink：${entryPath} → ${linkText}`)
      continue
    }

    logInfo('skills-sh', '拉取 symlink 目标', { entry: name, repoPath, source })
    rmSync(entryPath, { force: true })
    await downloadGithubRepoPath(source, repoPath, entryPath)
  }
}
