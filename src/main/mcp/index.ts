import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import { createCompatibleHttpMCPClient } from './protocolCompat'
import type { ToolSet } from 'ai'
import { dialog, type BrowserWindow } from 'electron'
import type { McpServerConfig, McpServerSpec, McpServerStatus, PonyId } from '../../shared/types'
import { getMcpServer, listMcpServers } from '../db'
import { logError, logInfo, logWarn } from '../logger'
import { prepareStdioLaunch } from '../runtimeEnv'
import type { Emitter } from '../agents'

const CONNECT_TIMEOUT_MS = 10_000
const SUMMARY_MAX = 200

interface ClientEntry {
  client: MCPClient
  config: McpServerConfig
  tools: string[]
}

const clients = new Map<string, ClientEntry>()
const statusCache = new Map<string, McpServerStatus>()

let getWindow: (() => BrowserWindow | null) | null = null

export function setMcpWindowProvider(fn: () => BrowserWindow | null): void {
  getWindow = fn
}

function truncate(s: string, n = SUMMARY_MAX): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function setStatus(id: string, status: McpServerStatus): void {
  statusCache.set(id, status)
}

export function listStatus(): McpServerStatus[] {
  return listMcpServers().map((cfg) => {
    const cached = statusCache.get(cfg.id)
    return cached ?? { id: cfg.id, state: 'stopped', tools: [] }
  })
}

export function invalidateServer(id: string): void {
  const entry = clients.get(id)
  if (entry) {
    void entry.client.close()
    clients.delete(id)
  }
  statusCache.delete(id)
}

export async function closeAll(): Promise<void> {
  const closes = [...clients.values()].map((e) => e.client.close())
  clients.clear()
  statusCache.clear()
  await Promise.allSettled(closes)
}

function createStdioTransport(spec: McpServerSpec) {
  const launch = prepareStdioLaunch(spec)
  return new Experimental_StdioMCPTransport(launch)
}

async function createMcpClient(spec: McpServerSpec): Promise<MCPClient> {
  if (spec.url) {
    return createCompatibleHttpMCPClient({ url: spec.url, headers: spec.headers })
  }
  return createMCPClient({ transport: createStdioTransport(spec) })
}

async function connectServer(cfg: McpServerConfig): Promise<ClientEntry> {
  const cached = clients.get(cfg.id)
  if (cached) return cached

  setStatus(cfg.id, { id: cfg.id, state: 'starting', tools: [] })
  logInfo('mcp', '连接 MCP', {
    id: cfg.id,
    name: cfg.name,
    url: cfg.spec.url,
    command: cfg.spec.command,
    args: cfg.spec.args
  })

  const connectPromise = (async () => {
    const client = await createMcpClient(cfg.spec)
    const tools = await client.tools()
    const toolNames = Object.keys(tools)
    const entry: ClientEntry = { client, config: cfg, tools: toolNames }
    clients.set(cfg.id, entry)
    setStatus(cfg.id, { id: cfg.id, state: 'running', tools: toolNames })
    logInfo('mcp', 'MCP 已连接', { id: cfg.id, name: cfg.name, tools: toolNames })
    return entry
  })()

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('连接超时（10s）')), CONNECT_TIMEOUT_MS)
  })

  try {
    return await Promise.race([connectPromise, timeout])
  } catch (err) {
    clients.delete(cfg.id)
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(cfg.id, { id: cfg.id, state: 'error', tools: [], error: msg })
    logError('mcp', `MCP 连接失败 id=${cfg.id} name=${cfg.name}`, err)
    throw err
  }
}

export async function testServer(id: string): Promise<McpServerStatus> {
  const cfg = getMcpServer(id)
  if (!cfg) return { id, state: 'error', tools: [], error: '配置不存在' }
  try {
    const entry = await connectServer(cfg)
    return { id, state: 'running', tools: entry.tools }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { id, state: 'error', tools: [], error: msg }
  }
}

async function confirmDestructive(toolName: string, argsSummary: string): Promise<boolean> {
  const win = getWindow?.()
  if (!win) return true
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['执行', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: '确认文件操作',
    message: `小马请求执行「${toolName}」`,
    detail: argsSummary
  })
  return response === 0
}

function wrapTool(
  serverName: string,
  toolName: string,
  tool: ToolSet[string],
  ctx: { runId: string; taskId: string; pony: PonyId; emit: Emitter }
): ToolSet[string] {
  const fullName = `${serverName}.${toolName}`
  const needsConfirm = /^(write|edit|move|delete|remove)_/i.test(toolName)

  return {
    ...tool,
    execute: async (args, options) => {
      const started = Date.now()
      const argsSummary = truncate(JSON.stringify(args))
      ctx.emit({
        type: 'tool_call_started',
        runId: ctx.runId,
        taskId: ctx.taskId,
        pony: ctx.pony,
        tool: fullName,
        argsSummary
      })

      if (needsConfirm) {
        const ok = await confirmDestructive(fullName, argsSummary)
        if (!ok) {
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: fullName,
            ok: false,
            resultSummary: '用户取消',
            durationMs: Date.now() - started
          })
          return `用户取消了本次「${fullName}」操作，请如实汇报，不要重试。`
        }
      }

      try {
        const result = await tool.execute!(args, options)
        const summary =
          typeof result === 'string' ? truncate(result) : truncate(JSON.stringify(result))
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: fullName,
          ok: true,
          resultSummary: summary,
          durationMs: Date.now() - started
        })
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.emit({
          type: 'tool_call_finished',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: fullName,
          ok: false,
          resultSummary: truncate(msg),
          durationMs: Date.now() - started
        })
        throw err
      }
    }
  }
}

/** 取多个 server 的工具合集，已包装事件发射与确认守卫 */
export async function getMcpToolsFor(
  serverIds: string[],
  ctx: { runId: string; taskId: string; pony: PonyId; emit: Emitter }
): Promise<ToolSet> {
  const merged: ToolSet = {}

  for (const serverId of serverIds) {
    const cfg = getMcpServer(serverId)
    if (!cfg) {
      throw new Error(`MCP server "${serverId}" 配置不存在`)
    }
    let entry: ClientEntry
    try {
      entry = await connectServer(cfg)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`MCP server "${cfg.name}" 连接失败：${msg}`)
    }

    const rawTools = await entry.client.tools()
    for (const [name, t] of Object.entries(rawTools)) {
      const key = `${cfg.name}_${name}`
      merged[key] = wrapTool(cfg.name, name, t, ctx)
    }
  }

  return merged
}
