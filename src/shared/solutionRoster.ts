import type { Pony, Solution } from './types'

export const GENERAL_OFFICE_SOLUTION_ID = 'general-office' as const

/** 按方案编制过滤小马列表（工作台场景 / UI 预览） */
export function filterPoniesBySolutionRoster(
  ponies: Pony[],
  solution: Solution | null | undefined
): Pony[] {
  if (!solution) return ponies
  const ids = new Set(solution.ponyIds)
  return ponies.filter((p) => ids.has(p.id))
}
