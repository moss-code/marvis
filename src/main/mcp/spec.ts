import type { McpServerConfig, McpServerSpec } from '../../shared/types'

/** 校验并规范化 MCP 连接规格（Cursor / Claude Desktop 兼容子集） */
export function normalizeMcpSpec(spec: McpServerSpec): McpServerSpec {
  const url = spec.url?.trim()
  const command = spec.command?.trim()

  if (url) {
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('url 须为 http 或 https')
      }
    } catch {
      throw new Error('无效的 MCP server url')
    }
    return { url, headers: spec.headers }
  }

  if (command) {
    return {
      command,
      args: spec.args ?? [],
      env: spec.env ?? {}
    }
  }

  throw new Error('MCP 配置须包含 url（远程 HTTP）或 command（stdio 子进程）')
}

/** 解析标准 JSON：支持 mcpServers 包装或直接 spec */
export function parseStandardMcpJson(jsonText: string): { name: string; spec: McpServerSpec } {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    throw new Error('JSON 格式无效')
  }
  if (!data || typeof data !== 'object') throw new Error('配置须为 JSON 对象')

  const obj = data as Record<string, unknown>

  if (obj.mcpServers && typeof obj.mcpServers === 'object') {
    const servers = obj.mcpServers as Record<string, McpServerSpec>
    const entries = Object.entries(servers)
    if (entries.length === 0) throw new Error('mcpServers 不能为空')
    if (entries.length > 1) {
      throw new Error('一次请只配置一个 MCP server（mcpServers 中仅保留一项）')
    }
    const [name, spec] = entries[0]
    if (!spec || typeof spec !== 'object') {
      throw new Error(`mcpServers.${name} 配置无效`)
    }
    return { name: String(name).trim(), spec: normalizeMcpSpec(spec as McpServerSpec) }
  }

  if (typeof obj.name === 'string' && obj.spec && typeof obj.spec === 'object') {
    return { name: obj.name, spec: normalizeMcpSpec(obj.spec as McpServerSpec) }
  }

  if (obj.url || obj.command) {
    const { name, url, command, args, env, headers, ...rest } = obj as McpServerSpec & {
      name?: string
    }
    if (Object.keys(rest).length > 0) {
      throw new Error('含未知字段，请使用标准 url 或 command/args/env 格式')
    }
    return {
      name: (obj as { name?: string }).name?.trim() || 'mcp-server',
      spec: normalizeMcpSpec({ url, command, args, env, headers })
    }
  }

  throw new Error(
    '无法识别的格式。示例：{"mcpServers":{"amap":{"url":"https://mcp.amap.com/mcp?key=..."}}}'
  )
}

/** 旧版 DB 记录（command 在顶层）→ 新 spec 结构 */
export function normalizeMcpConfig(raw: McpServerConfig & Partial<McpServerSpec>): McpServerConfig {
  if (raw.spec && (raw.spec.url || raw.spec.command)) {
    return { ...raw, spec: normalizeMcpSpec(raw.spec) }
  }
  if (raw.command) {
    return {
      id: raw.id,
      name: raw.name,
      builtin: raw.builtin,
      spec: normalizeMcpSpec({
        command: raw.command,
        args: raw.args ?? [],
        env: raw.env ?? {}
      })
    }
  }
  if (raw.url) {
    return {
      id: raw.id,
      name: raw.name,
      builtin: raw.builtin,
      spec: normalizeMcpSpec({ url: raw.url, headers: raw.headers })
    }
  }
  throw new Error(`MCP 配置「${raw.name}」无效：缺少 url 或 command`)
}

export function describeMcpConnection(cfg: McpServerConfig): string {
  if (cfg.spec.url) return cfg.spec.url
  const args = (cfg.spec.args ?? []).join(' ')
  return `${cfg.spec.command} ${args}`.trim()
}

export function toStandardMcpJson(cfg: McpServerConfig): string {
  return JSON.stringify({ mcpServers: { [cfg.name]: cfg.spec } }, null, 2)
}
