export interface ReportView {
  html: string
  title: string
}

const cache = new Map<string, ReportView>()

export function getCachedReport(id: string): ReportView | null {
  return cache.get(id) ?? null
}

export function setCachedReport(id: string, report: ReportView): void {
  cache.set(id, report)
}

export function removeCachedReport(id: string): void {
  cache.delete(id)
}
