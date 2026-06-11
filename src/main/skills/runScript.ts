import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { logInfo, logWarn } from '../logger'
import { getRuntimeProcessEnv, resolveExecutable } from '../runtimeEnv'
import { getSkillsDir } from '../workspace'

const SCRIPT_TIMEOUT_MS = 60_000
const MAX_OUTPUT_CHARS = 100_000

export interface RunScriptResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function assertScriptPath(skillId: string, scriptFile: string): string {
  const scriptsRoot = resolve(join(getSkillsDir(), skillId, 'scripts'))
  const target = resolve(scriptsRoot, scriptFile)
  const rel = relative(scriptsRoot, target)
  if (rel.startsWith('..') || rel.includes('..\\') || rel.includes('../')) {
    throw new Error('脚本路径非法')
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`脚本不存在：scripts/${scriptFile}`)
  }
  return target
}

function runnerFor(scriptPath: string, env: Record<string, string>): {
  command: string
  args: string[]
  env: Record<string, string>
} {
  const ext = extname(scriptPath).toLowerCase()

  if (ext === '.py') {
    const python = resolveExecutable('python', env)
    return { command: python, args: [scriptPath], env }
  }

  if (['.js', '.mjs', '.cjs'].includes(ext)) {
    const node = resolveExecutable('node', env)
    if (node === process.execPath) env = { ...env, ELECTRON_RUN_AS_NODE: '1' }
    return { command: node, args: [scriptPath], env }
  }

  if (ext === '.ps1' && process.platform === 'win32') {
    return {
      command: process.env.SystemRoot
        ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      env
    }
  }

  if (['.cmd', '.bat'].includes(ext) && process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', scriptPath],
      env
    }
  }

  if (ext === '.sh') {
    const sh = resolveExecutable('bash', env) ?? resolveExecutable('sh', env) ?? '/bin/sh'
    return { command: sh, args: [scriptPath], env }
  }

  throw new Error(`不支持的脚本类型：${ext || '无扩展名'}（支持 .py .js .mjs .cjs .sh .ps1 .cmd .bat）`)
}

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return text.slice(0, MAX_OUTPUT_CHARS) + '\n…（输出已截断）'
}

/** 执行 Skill scripts/ 下的脚本（允许网络请求，继承运行时 PATH） */
export function runSkillScript(
  skillId: string,
  scriptFile: string,
  args: string[] = [],
  stdin?: string,
  signal?: AbortSignal
): Promise<RunScriptResult> {
  const scriptPath = assertScriptPath(skillId, scriptFile)
  const env = getRuntimeProcessEnv()
  const { command, args: baseArgs, env: runEnv } = runnerFor(scriptPath, env)
  const cwd = dirname(scriptPath)

  logInfo('skill-script', '执行脚本', {
    skillId,
    script: scriptFile,
    command,
    args: [...baseArgs, ...args],
    cwd
  })

  return new Promise((resolvePromise, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(command, [...baseArgs, ...args], {
      cwd,
      env: runEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const onAbort = (): void => {
      timedOut = false
      child.kill('SIGTERM')
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, SCRIPT_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      const result = {
        exitCode: code,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        timedOut
      }
      if (timedOut || code !== 0) {
        logWarn('skill-script', '脚本结束（异常）', {
          skillId,
          script: scriptFile,
          exitCode: code,
          timedOut,
          stderr: result.stderr.slice(0, 200)
        })
      } else {
        logInfo('skill-script', '脚本结束', {
          skillId,
          script: scriptFile,
          exitCode: code,
          stdoutLen: result.stdout.length
        })
      }
      resolvePromise(result)
    })

    if (stdin) {
      child.stdin?.write(stdin)
    }
    child.stdin?.end()
  })
}
