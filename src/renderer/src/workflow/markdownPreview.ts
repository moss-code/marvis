/** 从完整轨迹中提取适合 Markdown 渲染的预览文本（保留换行） */
export function extractWorkflowMarkdownPreview(
  raw: string | undefined,
  fallback: string | undefined
): string | undefined {
  if (!raw?.trim()) return fallback?.trim() || undefined

  const finalMarker = '## 最终回复'
  const finalIdx = raw.indexOf(finalMarker)
  if (finalIdx >= 0) {
    const section = raw.slice(finalIdx + finalMarker.length).trim()
    if (section) return section
  }

  if (raw.includes('\n') && !raw.startsWith('# 执行轨迹')) {
    return raw.trim()
  }

  return fallback?.trim() || undefined
}
