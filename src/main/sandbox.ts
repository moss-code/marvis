import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { PonyId } from '../shared/types'
import { getPermissionPolicy, resolveWorkspaceTarget } from './governance'
import { logInfo, logWarn } from './logger'
import { clearPonyTaskMemory } from './ponyTaskMemory'
import { getWorkspaceDir } from './workspace'

const SANDBOX_DIR = '.pony-sandbox'

export interface TaskSandbox {
  runId: string
  taskId: string
  ponyId: PonyId
  root: string
  scriptsDir: string
  workDir: string
  outDir: string
  /** 若复用上一轮失败任务的沙箱目录，记录原 taskId */
  reusedFromTaskId?: string
}

const activeSandboxes = new Map<string, TaskSandbox>()
/** 同 runId + ponyId 上一轮失败保留的沙箱，供下一次派单复用 */
const reusableFailedSandboxes = new Map<string, TaskSandbox>()

function sandboxKey(runId: string, taskId: string): string {
  return `${runId}:${taskId}`
}

function failedSandboxKey(runId: string, ponyId: PonyId): string {
  return `${runId}:${ponyId}`
}

/** 绑定了 Skill 且权限策略勾选「可运行 Skill script」时为该子任务启用沙箱 */
export function shouldUseSandbox(ponyId: PonyId, skillIds: string[]): boolean {
  if (!skillIds.length) return false
  return getPermissionPolicy(ponyId).canRunSkillScript
}

export function createTaskSandbox(runId: string, taskId: string, ponyId: PonyId): TaskSandbox {
  const reuseKey = failedSandboxKey(runId, ponyId)
  const prior = reusableFailedSandboxes.get(reuseKey)

  if (prior && existsSync(prior.root)) {
    reusableFailedSandboxes.delete(reuseKey)
    const sandbox: TaskSandbox = {
      runId,
      taskId,
      ponyId,
      root: prior.root,
      scriptsDir: prior.scriptsDir,
      workDir: prior.workDir,
      outDir: prior.outDir,
      reusedFromTaskId: prior.taskId
    }
    for (const dir of [sandbox.scriptsDir, sandbox.workDir, sandbox.outDir]) {
      mkdirSync(dir, { recursive: true })
    }
    activeSandboxes.set(sandboxKey(runId, taskId), sandbox)
    logInfo('sandbox', '已复用失败任务沙箱', {
      runId,
      taskId,
      ponyId,
      root: sandbox.root,
      priorTaskId: prior.taskId
    })
    return sandbox
  }

  if (prior) {
    reusableFailedSandboxes.delete(reuseKey)
  }

  const root = join(getWorkspaceDir(), SANDBOX_DIR, runId, taskId)
  const sandbox: TaskSandbox = {
    runId,
    taskId,
    ponyId,
    root,
    scriptsDir: join(root, 'scripts'),
    workDir: join(root, 'work'),
    outDir: join(root, 'out')
  }
  for (const dir of [sandbox.scriptsDir, sandbox.workDir, sandbox.outDir]) {
    mkdirSync(dir, { recursive: true })
  }
  activeSandboxes.set(sandboxKey(runId, taskId), sandbox)
  logInfo('sandbox', '已创建任务沙箱', {
    runId,
    taskId,
    ponyId,
    root
  })
  return sandbox
}

/** 子任务失败时登记沙箱，供同 run、同马的下一次派单复用 */
export function markSandboxReusable(sandbox: TaskSandbox): void {
  const key = failedSandboxKey(sandbox.runId, sandbox.ponyId)
  reusableFailedSandboxes.set(key, sandbox)
  activeSandboxes.delete(sandboxKey(sandbox.runId, sandbox.taskId))
  logInfo('sandbox', '沙箱已保留可复用', {
    runId: sandbox.runId,
    taskId: sandbox.taskId,
    ponyId: sandbox.ponyId,
    root: sandbox.root
  })
}

export function getTaskSandbox(runId: string, taskId: string): TaskSandbox | undefined {
  return activeSandboxes.get(sandboxKey(runId, taskId))
}

export function assertSandboxScriptPath(sandbox: TaskSandbox, scriptFile: string): string {
  const target = resolve(sandbox.scriptsDir, scriptFile)
  const rel = relative(sandbox.scriptsDir, target)
  if (rel.startsWith('..') || rel.includes('..\\') || rel.includes('../')) {
    throw new Error('沙箱脚本路径非法')
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`沙箱脚本不存在：scripts/${scriptFile}`)
  }
  return target
}

/** 沙箱任务中的 MCP 写入须落在沙箱根目录内 */
export function assertSandboxWriteTarget(sandboxRoot: string, pathValue: string): string {
  const target = resolveWorkspaceTarget(pathValue)
  const sandboxReal = realpathSync.native(sandboxRoot)
  const anchor = existsSync(target)
    ? realpathSync.native(target)
    : realpathSync.native(existingAncestor(target))
  const rel = relative(sandboxReal, anchor)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `本任务已启用沙箱，写入须在其目录内（${sandboxRoot}），禁止写到：${pathValue}`
    )
  }
  return target
}

function existingAncestor(pathValue: string): string {
  let current = pathValue
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return current
}

export function promoteSandboxFile(
  sandbox: TaskSandbox,
  outFile: string,
  destPath: string
): string {
  const normalized = outFile.replace(/^out[/\\]/, '').replace(/\\/g, '/')
  const src = resolve(sandbox.outDir, normalized)
  if (!existsSync(src) || !statSync(src).isFile()) {
    throw new Error(`沙箱 out/ 中不存在文件：${normalized}`)
  }
  const dest = resolveWorkspaceTarget(destPath)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  logInfo('sandbox', '已提升沙箱成品', { from: src, to: dest })
  return dest
}

export function destroyTaskSandbox(runId: string, taskId: string): void {
  const key = sandboxKey(runId, taskId)
  const sandbox = activeSandboxes.get(key)
  if (!sandbox) return
  try {
    if (existsSync(sandbox.root)) {
      rmSync(sandbox.root, { recursive: true, force: true })
    }
    logInfo('sandbox', '已移除任务沙箱', { runId, taskId, root: sandbox.root })
  } catch (err) {
    logWarn('sandbox', '移除沙箱失败', {
      runId,
      taskId,
      error: err instanceof Error ? err.message : String(err)
    })
  } finally {
    activeSandboxes.delete(key)
    reusableFailedSandboxes.delete(failedSandboxKey(sandbox.runId, sandbox.ponyId))
    clearPonyTaskMemory(sandbox.runId, sandbox.ponyId)
  }
}

export function describeSandboxForPrompt(sandbox: TaskSandbox): string {
  const reuseNote = sandbox.reusedFromTaskId
    ? `\n- **沿用上一轮失败任务沙箱**（原 taskId=${sandbox.reusedFromTaskId}）：\`scripts/\` 中可能已有脚本，优先修改后重新 run_sandbox_script，勿从零重写除非必要`
    : ''
  return `## 本任务沙箱（已启用「可运行 Skill script」权限）
- 沙箱根目录：\`${sandbox.root}\`${reuseNote}
- **推荐顺序（必须按序，不可跳步）**：
  1. filesystem.write_file → 写入 \`scripts/\` 下的生成脚本（**禁止**未写入就先 run_sandbox_script）
  2. **run_sandbox_script** → 立刻执行；产出写到 \`out/\`（edit_file 微调同一脚本最多 2 次后必须再执行）
  3. **promote_sandbox_file** → 将 \`out/\` 成品提升到工作区目标路径
  4. filesystem.get_file_info → 验证工作区目标文件存在后再汇报完成
- \`work/\`：中间文件、unpack 临时目录等
- 本任务中 filesystem 的**写入**仅允许在沙箱目录内；读取仍可使用整个工作区
- Skill 内置脚本仍用 run_skill_script；你在沙箱里自写的生成脚本用 run_sandbox_script
- 提升成品后可设置 removeSandbox=true 自动清理沙箱`
}
