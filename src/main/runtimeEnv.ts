import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpServerSpec } from '../shared/types'

const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'

function pathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':'
}

function splitPath(value: string | undefined): string[] {
  if (!value) return []
  return value.split(pathSeparator()).map((p) => p.trim()).filter(Boolean)
}

function mergePathSegments(...groups: string[][]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    for (const p of group) {
      const norm = p.replace(/[/\\]+$/, '')
      if (!norm || seen.has(norm.toLowerCase())) continue
      seen.add(norm.toLowerCase())
      out.push(norm)
    }
  }
  return out.join(pathSeparator())
}

function readWindowsShellPath(): string | undefined {
  if (process.platform !== 'win32') return undefined
  try {
    const out = execSync('cmd.exe /d /s /c echo %PATH%', {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const line = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return line || undefined
  } catch {
    return undefined
  }
}

function collectCandidatePaths(): string[] {
  const home = homedir()
  const paths: string[] = []

  if (process.platform === 'win32') {
    const { LOCALAPPDATA, APPDATA, ProgramFiles } = process.env
    const programFilesX86 = process.env['ProgramFiles(x86)']
    if (ProgramFiles) paths.push(join(ProgramFiles, 'nodejs'))
    if (programFilesX86) paths.push(join(programFilesX86, 'nodejs'))
    if (APPDATA) paths.push(join(APPDATA, 'npm'))
    if (LOCALAPPDATA) {
      paths.push(join(LOCALAPPDATA, 'Programs', 'Python'))
      paths.push(join(LOCALAPPDATA, 'Microsoft', 'WindowsApps'))
      const pyRoot = join(LOCALAPPDATA, 'Programs', 'Python')
      if (existsSync(pyRoot)) {
        for (const dir of readdirSync(pyRoot, { withFileTypes: true })) {
          if (!dir.isDirectory()) continue
          paths.push(join(pyRoot, dir.name))
          paths.push(join(pyRoot, dir.name, 'Scripts'))
        }
      }
    }
  } else {
    paths.push('/usr/local/bin', '/opt/homebrew/bin', join(home, '.local', 'bin'))
  }

  if (process.env.CONDA_PREFIX) {
    paths.push(process.env.CONDA_PREFIX)
    paths.push(join(process.env.CONDA_PREFIX, 'Scripts'))
    paths.push(join(process.env.CONDA_PREFIX, 'bin'))
    paths.push(join(process.env.CONDA_PREFIX, 'Library', 'bin'))
  }

  paths.push(join(home, '.local', 'bin'), join(home, '.cargo', 'bin'))

  const extra = process.env.EXTRA_PATH?.split(pathSeparator()) ?? []
  paths.push(...extra.map((p) => p.trim()).filter(Boolean))

  return paths.filter((p) => existsSync(p))
}

function applyPathToProcessEnv(mergedPath: string): void {
  process.env.PATH = mergedPath
  if (process.platform === 'win32') {
    process.env.Path = mergedPath
  }
}

/** 启动时补全 PATH，避免 GUI 启动的 Electron 找不到 node/python/npx/uvx */
export function initRuntimeEnv(): void {
  const shellPath = readWindowsShellPath()
  const merged = mergePathSegments(
    collectCandidatePaths(),
    splitPath(shellPath),
    splitPath(process.env.PATH),
    splitPath(process.env.Path)
  )
  if (merged) applyPathToProcessEnv(merged)
}

export function getRuntimeProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null) env[k] = v
  }
  return env
}

function lookupExecutable(command: string, env: Record<string, string>): string | undefined {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`where.exe ${command}`, {
        env,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    }
    const out = execSync(`command -v ${command}`, {
      env,
      encoding: 'utf8',
      shell: '/bin/sh',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return out.trim().split(/\r?\n/)[0] || undefined
  } catch {
    return undefined
  }
}

export function resolveExecutable(command: string, env: Record<string, string>): string {
  const raw = command.trim()
  if (!raw) return raw
  if (/[\\/]/.test(raw) || /^[A-Za-z]:/.test(raw)) return raw

  if (raw === 'node' || raw === 'nodejs') {
    return process.env.MCP_NODE?.trim() || process.execPath
  }
  if (raw === 'python' || raw === 'python3') {
    const fromEnv = process.env.MCP_PYTHON?.trim()
    if (fromEnv) return fromEnv
  }

  return lookupExecutable(raw, env) ?? raw
}

/** 规范化 stdio MCP 启动参数（解析解释器、Windows .cmd、Electron 当 node 用） */
export function prepareStdioLaunch(spec: McpServerSpec): {
  command: string
  args: string[]
  env: Record<string, string>
} {
  if (!spec.command) throw new Error('MCP 配置须包含 command')

  const env = { ...getRuntimeProcessEnv(), ...(spec.env ?? {}) }
  const args = [...(spec.args ?? [])]
  let command = resolveExecutable(spec.command, env)

  if (spec.command.trim() === 'node' && command === process.execPath) {
    env.ELECTRON_RUN_AS_NODE = '1'
  }

  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
      env
    }
  }

  return { command, args, env }
}
