import { app } from 'electron'
import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { dirname, join } from 'node:path'

let effectiveEnvPath: string | null = null

/** 打包后 .env 查找顺序：exe 同目录 → userData → app 路径（dev） */
export function resolveEnvFilePath(): string | null {
  const candidates: string[] = [join(dirname(process.execPath), '.env')]
  try {
    candidates.push(join(app.getPath('userData'), '.env'))
  } catch {
    /* app 尚未 ready 时跳过 */
  }
  try {
    candidates.push(join(app.getAppPath(), '.env'))
  } catch {
    /* ignore */
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

export function loadEnvFile(): string | null {
  const path = resolveEnvFilePath()
  if (path) {
    loadEnv({ path })
    effectiveEnvPath = path
  }
  return path
}

export function getEffectiveEnvPath(): string {
  return effectiveEnvPath ?? '(未找到 .env 文件，请在 exe 同目录或 userData 放置 .env)'
}

/** config:save 写回路径：已加载则用原路径，否则 exe 同目录新建 */
export function getEnvWritePath(): string {
  if (effectiveEnvPath) return effectiveEnvPath
  return join(dirname(process.execPath), '.env')
}

export function setEffectiveEnvPath(path: string): void {
  effectiveEnvPath = path
}

/** electron-builder 解包路径：spawn 子进程时 asar 内路径须替换 */
export function resolveAsarUnpackedPath(filePath: string): string {
  return filePath.replace(/app\.asar([\\/]|$)/, 'app.asar.unpacked$1')
}
