import type { Solution } from '@shared/types'
import { GENERAL_OFFICE_SOLUTION_ID } from '@shared/solutionRoster'

const STORAGE_KEY = 'pony-office:activeSolutionId'

export function readPersistedActiveSolutionId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function persistActiveSolutionId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* 忽略存储失败 */
  }
}

/** 从持久化或默认项解析当前启用方案 */
export function resolveActiveSolutionId(solutions: Solution[]): string {
  const stored = readPersistedActiveSolutionId()
  if (stored && solutions.some((s) => s.id === stored)) return stored
  if (solutions.some((s) => s.id === GENERAL_OFFICE_SOLUTION_ID)) return GENERAL_OFFICE_SOLUTION_ID
  return solutions[0]?.id ?? GENERAL_OFFICE_SOLUTION_ID
}
