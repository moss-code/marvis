export interface DifyWorkflowInput {
  workflowId?: string
  inputs?: Record<string, unknown>
  query?: string
  user?: string
}

export interface DifyWorkflowResult {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

const DEFAULT_BASE_URL = 'https://api.dify.ai/v1'
const DEFAULT_TIMEOUT_MS = 90_000
const MAX_RESULT_CHARS = 50_000

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

function getBaseUrl(): string {
  return trimSlash(process.env.DIFY_API_BASE_URL?.trim() || DEFAULT_BASE_URL)
}

function getTimeoutMs(): number {
  const raw = Number(process.env.DIFY_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS
}

export function isDifyConfigured(): boolean {
  return Boolean(process.env.DIFY_API_KEY?.trim())
}

function workflowEndpoint(workflowId?: string): string {
  const base = getBaseUrl()
  const id = workflowId?.trim() || process.env.DIFY_WORKFLOW_ID?.trim()
  return id ? `${base}/workflows/${encodeURIComponent(id)}/run` : `${base}/workflows/run`
}

function compactResult(value: unknown): unknown {
  const text = JSON.stringify(value)
  if (text.length <= MAX_RESULT_CHARS) return value
  return {
    truncated: true,
    maxChars: MAX_RESULT_CHARS,
    preview: text.slice(0, MAX_RESULT_CHARS)
  }
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  return String(value)
}

/** 调用 Dify Workflow blocking API。返回值不做业务字段映射，交给子马自行理解。 */
export async function runDifyWorkflow(input: DifyWorkflowInput): Promise<DifyWorkflowResult> {
  const apiKey = process.env.DIFY_API_KEY?.trim()
  if (!apiKey) throw new Error('未配置 DIFY_API_KEY，无法调用 Dify 工作流')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getTimeoutMs())
  const body = {
    inputs: input.inputs ?? {},
    query: input.query,
    response_mode: 'blocking',
    user: input.user?.trim() || 'pony-office'
  }

  try {
    const res = await fetch(workflowEndpoint(input.workflowId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const contentType = res.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json') ? await res.json() : await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof payload === 'string' ? payload : JSON.stringify(payload)
      }
    }

    return { ok: true, status: res.status, data: compactResult(payload) }
  } catch (err) {
    return { ok: false, status: 0, error: errorMessage(err) }
  } finally {
    clearTimeout(timer)
  }
}
