import type { McpServerConfig, McpServerSpec } from './types'

/** 兼容旧版 DB 记录（command 在顶层）与新版 spec */
export type LegacyMcpServerConfig = McpServerConfig & Partial<McpServerSpec>

export function coerceMcpSpec(m: LegacyMcpServerConfig): McpServerSpec | null {
  if (m.spec?.url || m.spec?.command) return m.spec
  if (m.url?.trim()) return { url: m.url.trim(), headers: m.headers }
  if (m.command?.trim()) {
    return { command: m.command.trim(), args: m.args ?? [], env: m.env ?? {} }
  }
  return null
}

export function mcpConnectionLabel(m: LegacyMcpServerConfig): string {
  const spec = coerceMcpSpec(m)
  if (!spec) return '（配置无效，请重新编辑）'
  if (spec.url) return spec.url
  const args = (spec.args ?? []).join(' ')
  return `${spec.command ?? ''} ${args}`.trim()
}

export function toMcpJson(m: LegacyMcpServerConfig): string {
  const spec = coerceMcpSpec(m)
  if (!spec) return '{\n  "mcpServers": {}\n}'
  return JSON.stringify({ mcpServers: { [m.name]: spec } }, null, 2)
}
