const MAX_TOOL_INPUT_CHARS = 16_000

function truncateForTrace(text: string, max = MAX_TOOL_INPUT_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n\n…（已截断，共 ${text.length} 字符）`
}

function stringifyToolInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

type PonyStep = {
  text?: string
  toolCalls?: { toolName: string; input?: unknown }[]
}

type PonyGenerateResult = {
  text?: string
  steps?: PonyStep[]
}

/** 汇总小马 generateText 多步轨迹 + 最终文字，供工作流「原始回答」展示 */
export function buildPonyRawOutput(res: PonyGenerateResult, finalText: string): string {
  const blocks: string[] = []
  const steps = res.steps ?? []

  if (steps.length > 0) {
    blocks.push('# 执行轨迹')
    steps.forEach((step, index) => {
      blocks.push(`## 步骤 ${index + 1}`)
      if (step.text?.trim()) {
        blocks.push('### 模型思考 / 说明')
        blocks.push(step.text.trim())
      }
      for (const tc of step.toolCalls ?? []) {
        blocks.push(`### 工具调用 \`${tc.toolName}\``)
        const payload = truncateForTrace(stringifyToolInput(tc.input))
        if (payload.includes('\n') || payload.length > 120) {
          blocks.push('```json')
          blocks.push(payload)
          blocks.push('```')
        } else {
          blocks.push(payload)
        }
      }
    })
  }

  const closing = finalText.trim() || res.text?.trim() || ''
  if (closing) {
    blocks.push('## 最终回复')
    blocks.push(closing)
  }

  return blocks.join('\n\n').trim() || closing || '（无文字记录；请查看下方工具调用详情）'
}

export function formatSqlToolArgsDetail(sql: string): string {
  return truncateForTrace(sql.trim(), 8_000)
}

export function formatRenderReportArgsDetail(title: string, html: string): string {
  const body = truncateForTrace(html.trim(), 12_000)
  return `## 报告标题\n${title}\n\n## HTML 正文\n\`\`\`html\n${body}\n\`\`\``
}

export function formatToolResultDetail(payload: unknown, max = 8_000): string | undefined {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  if (!text.trim()) return undefined
  return truncateForTrace(text, max)
}
