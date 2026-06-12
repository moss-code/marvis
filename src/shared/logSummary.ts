export const LOG_SUMMARY_MAX = 200

/** 日志摘要：summary 用于列表展示，detail 为被截断时的完整原文 */
export function logSummary(
  s: string,
  n = LOG_SUMMARY_MAX
): { summary: string; detail?: string } {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return { summary: t }
  return { summary: t.slice(0, n) + '…', detail: t }
}
