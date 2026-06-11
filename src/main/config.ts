import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import type { ModelConfig } from '../shared/types'
import { getEnvWritePath, setEffectiveEnvPath } from './envPath'

const ENV_KEYS = {
  baseUrl: 'OPENAI_BASE_URL',
  apiKey: 'OPENAI_API_KEY',
  model: 'MODEL'
} as const

function maskSecret(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (v.length < 8) return '***'
  return `${v.slice(0, 3)}***${v.slice(-4)}`
}

export function getModelConfig(): ModelConfig {
  return {
    baseUrl: process.env.OPENAI_BASE_URL?.trim() ?? '',
    apiKey: maskSecret(process.env.OPENAI_API_KEY ?? ''),
    model: process.env.MODEL?.trim() || 'deepseek-chat'
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return { key, value }
}

function formatEnvLine(key: string, value: string): string {
  const needsQuote = /[\s#]/.test(value)
  return needsQuote ? `${key}="${value.replaceAll('"', '\\"')}"` : `${key}=${value}`
}

/** 逐行替换目标键，保留注释、空行与未知键 */
export function saveModelConfig(input: ModelConfig): void {
  const envPath = getEnvWritePath()
  const setKeys: Record<string, string | null> = {
    [ENV_KEYS.baseUrl]: input.baseUrl.trim(),
    [ENV_KEYS.model]: input.model.trim() || 'deepseek-chat',
    [ENV_KEYS.apiKey]: input.apiKey.trim() ? input.apiKey.trim() : null
  }

  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const lines = existing.length > 0 ? existing.split(/\r?\n/) : []
  const seen = new Set<string>()
  const out: string[] = []

  for (const line of lines) {
    const parsed = parseEnvLine(line)
    if (!parsed || !(parsed.key in setKeys)) {
      out.push(line)
      continue
    }
    seen.add(parsed.key)
    const nextVal = setKeys[parsed.key]
    if (nextVal !== null) out.push(formatEnvLine(parsed.key, nextVal))
    else out.push(line)
  }

  for (const [key, val] of Object.entries(setKeys)) {
    if (seen.has(key) || val === null) continue
    out.push(formatEnvLine(key, val))
  }

  const body = out.join('\n').replace(/\n*$/, '') + '\n'
  const tmp = `${envPath}.tmp`
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, envPath)
  setEffectiveEnvPath(envPath)

  process.env[ENV_KEYS.baseUrl] = setKeys[ENV_KEYS.baseUrl]!
  process.env[ENV_KEYS.model] = setKeys[ENV_KEYS.model]!
  if (setKeys[ENV_KEYS.apiKey]) process.env[ENV_KEYS.apiKey] = setKeys[ENV_KEYS.apiKey]!
}
