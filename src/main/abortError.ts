/** AI SDK 各层 abort 错误形态不一，统一宽松识别 */
export function isAbortError(err: unknown): boolean {
  if (err == null) return false
  if (typeof err === 'object' && 'name' in err) {
    const name = String((err as { name: unknown }).name)
    if (name === 'AbortError' || name === 'ResponseAborted') return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return /abort/i.test(msg)
}
