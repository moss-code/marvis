import { createMCPClient, type MCPClient, type MCPTransport } from '@ai-sdk/mcp'
import type { JSONRPCMessage } from '@ai-sdk/mcp'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

/** 新版客户端默认协议；较旧 HTTP MCP 服务可能不支持 */
const PROTOCOL_VERSION_FALLBACK = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07'
] as const

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function isUnsupportedProtocolVersionError(err: unknown): boolean {
  return /unsupported protocol version/i.test(errorText(err))
}

/** 从服务端错误信息中解析其声明支持的协议版本列表 */
export function parseSupportedProtocolVersions(err: unknown): string[] {
  const text = errorText(err)
  const match = text.match(/supported versions:\s*([^)"]+)/i)
  if (!match) return []
  return match[1]
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

/**
 * 在 HTTP 层与 initialize 请求体中统一使用指定协议版本。
 * @ai-sdk/mcp 默认发送 2025-11-25，旧服务端会在握手前直接 400。
 */
class ProtocolCompatTransport implements MCPTransport {
  protocolVersion?: string
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  private readonly sdk: StreamableHTTPClientTransport

  constructor(url: string, headers: Record<string, string> | undefined, version: string) {
    this.protocolVersion = version
    this.sdk = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: headers ? { headers } : undefined
    })
    this.sdk.setProtocolVersion(version)
  }

  async start(): Promise<void> {
    this.sdk.onclose = () => this.onclose?.()
    this.sdk.onerror = (error) => this.onerror?.(error)
    this.sdk.onmessage = (message) => this.onmessage?.(message as JSONRPCMessage)
    if (this.protocolVersion) {
      this.sdk.setProtocolVersion(this.protocolVersion)
    }
    await this.sdk.start()
  }

  async close(): Promise<void> {
    await this.sdk.close()
  }

  async send(message: JSONRPCMessage): Promise<void> {
    let outbound = message
    if (
      this.protocolVersion &&
      'method' in message &&
      message.method === 'initialize' &&
      'params' in message &&
      message.params
    ) {
      outbound = {
        ...message,
        params: {
          ...(message.params as Record<string, unknown>),
          protocolVersion: this.protocolVersion
        }
      } as JSONRPCMessage
    }
    await this.sdk.send(outbound)
  }
}

export async function createCompatibleHttpMCPClient(config: {
  url: string
  headers?: Record<string, string>
}): Promise<MCPClient> {
  try {
    return await createMCPClient({
      transport: { type: 'http', url: config.url, headers: config.headers }
    })
  } catch (err) {
    if (!isUnsupportedProtocolVersionError(err)) throw err

    const supported = parseSupportedProtocolVersions(err)
    const versions = supported.length > 0 ? supported : [...PROTOCOL_VERSION_FALLBACK]

    let lastError: unknown = err
    for (const version of versions) {
      const transport = new ProtocolCompatTransport(config.url, config.headers, version)
      try {
        return await createMCPClient({ transport })
      } catch (retryErr) {
        lastError = retryErr
        await transport.close().catch(() => undefined)
        if (!isUnsupportedProtocolVersionError(retryErr)) throw retryErr
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}
