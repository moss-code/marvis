import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { AutomationAttachment, SolutionDataKind } from '../../shared/types'
import { getWorkspaceDir } from '../workspace'

function kindFromExt(fileName: string): SolutionDataKind {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.xlsx') return 'xlsx'
  if (ext === '.xls') return 'xls'
  if (ext === '.csv') return 'csv'
  return 'txt'
}

export function getAutomationJobDir(jobId: string): string {
  const dir = join(getWorkspaceDir(), 'automation', jobId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function copyJobAttachments(
  jobId: string,
  sources: { sourcePath: string; fileName: string }[]
): AutomationAttachment[] {
  const dir = getAutomationJobDir(jobId)
  const out: AutomationAttachment[] = []
  for (const src of sources) {
    if (!existsSync(src.sourcePath)) {
      throw new Error(`附件不存在：${src.fileName}`)
    }
    const safeName = basename(src.fileName).replace(/[\\/:*?"<>|]/g, '_') || 'file'
    const dest = join(dir, safeName)
    copyFileSync(src.sourcePath, dest)
    out.push({
      fileName: safeName,
      storedPath: dest,
      kind: kindFromExt(safeName)
    })
  }
  return out
}

export function mergeJobAttachments(
  jobId: string,
  existing: AutomationAttachment[],
  newSources: { sourcePath: string; fileName: string }[] | undefined,
  replaceAll: boolean
): AutomationAttachment[] {
  if (!newSources?.length) return existing
  if (replaceAll) {
    deleteJobAttachments(jobId)
    return copyJobAttachments(jobId, newSources)
  }
  return [...existing, ...copyJobAttachments(jobId, newSources)]
}

export function deleteJobAttachments(jobId: string): void {
  const dir = join(getWorkspaceDir(), 'automation', jobId)
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { force: true })
  }
}

export function deleteAutomationJobDir(jobId: string): void {
  const dir = join(getWorkspaceDir(), 'automation', jobId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}
