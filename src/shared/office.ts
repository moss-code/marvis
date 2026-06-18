/** 办公室编制与工位布局 —— 主进程与渲染进程共享 */
import type { Pony } from './types'

export const OFFICE_CAPACITY = 12

/** 方案/工作台办公室编制是否已满 */
export function isOfficeRosterFull(ponyIds: readonly string[]): boolean {
  return ponyIds.length >= OFFICE_CAPACITY
}
export const DESIGN_W = 1760
export const DESIGN_H = 720
/** 后墙展板统一顶边（世界 Y，越负越高） */
export const WALL_BOARD_TOP = -490
/** 后墙展板统一尺寸（报告白板与任务日志屏相同） */
export const LOG_BOARD_W = 360
export const LOG_BOARD_H = 228
/** 展板容器中心 Y（与画框顶边 WALL_BOARD_TOP 对齐） */
export const WALL_BOARD_Y = WALL_BOARD_TOP + LOG_BOARD_H / 2
/** 报告白板：窗户与任务日志屏之间的后墙位置 */
export const WHITEBOARD_X = 480
export const WHITEBOARD_Y = WALL_BOARD_Y
/** 任务日志屏位置 */
export const LOG_BOARD_X = 860
export const LOG_BOARD_Y = WALL_BOARD_Y
export const HIRE_DESK_X = 1690

export const PRESET_PONY_ORDER = ['leader', 'data', 'report', 'file', 'writer'] as const

/** 自定义马工位 index（前排 1 + 后排 6） */
export const CUSTOM_DESK_INDICES = [5, 6, 7, 8, 9, 10, 11] as const

export type DeskRow = 'front' | 'back'

export interface DeskSlot {
  index: number
  x: number
  y: number
  row: DeskRow
  /** 排序深度：0 = 最前最大，数值越大越靠后越小 */
  depth: number
  ponyScale: number
  deskScale: number
}

/** 工位网格：4 排 × 3 列，居中铺在办公室下半区，前排大后排小制造景深 */
const GRID_CENTER_X = DESIGN_W / 2
const COL_GAP = 400
const ROW_GAP = 132
const COL_OFFSETS = [-COL_GAP, 0, COL_GAP] as const

/** 小马与桌子整体放大系数（相对房间） */
const GRID_SCALE = 1.35

interface RowDef {
  /** 列横向展开系数：越靠后越向中心收拢 */
  spread: number
  ponyScale: number
  deskScale: number
}

const ROW_DEFS: readonly RowDef[] = [
  { spread: 1.0, ponyScale: 1.18, deskScale: 1.12 },
  { spread: 0.9, ponyScale: 1.05, deskScale: 1.0 },
  { spread: 0.81, ponyScale: 0.94, deskScale: 0.9 },
  { spread: 0.73, ponyScale: 0.85, deskScale: 0.82 }
]

/** 最远排工位的世界 Y（越负越靠后/靠上），供场景计算地面高度 */
export const OFFICE_DEEPEST_ROW_Y = -ROW_GAP * (ROW_DEFS.length - 1)

export const DESK_SLOTS: readonly DeskSlot[] = ROW_DEFS.flatMap((rowDef, depth) =>
  COL_OFFSETS.map(
    (offset, col): DeskSlot => ({
      index: depth * COL_OFFSETS.length + col,
      x: Math.round(GRID_CENTER_X + offset * rowDef.spread),
      y: -ROW_GAP * depth,
      row: depth <= 1 ? 'front' : 'back',
      depth,
      ponyScale: Number((rowDef.ponyScale * GRID_SCALE).toFixed(3)),
      deskScale: Number((rowDef.deskScale * GRID_SCALE).toFixed(3))
    })
  )
)

export function getDeskSlot(index: number): DeskSlot {
  return DESK_SLOTS[index] ?? DESK_SLOTS[DESK_SLOTS.length - 1]
}

export function isPresetPony(id: string): boolean {
  return (PRESET_PONY_ORDER as readonly string[]).includes(id)
}

/** 为花名册分配工位：预置马固定前排 0–4；自定义马按 id 稳定顺序填入首个空位 */
export function buildDeskAssignments(roster: Pony[]): Map<string, number> {
  const occupied = new Set<number>()
  const assignments = new Map<string, number>()

  for (const id of PRESET_PONY_ORDER) {
    if (roster.some((p) => p.id === id)) {
      const idx = PRESET_PONY_ORDER.indexOf(id)
      assignments.set(id, idx)
      occupied.add(idx)
    }
  }

  const customs = roster
    .filter((p) => !isPresetPony(p.id))
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const pony of customs) {
    const desk = CUSTOM_DESK_INDICES.find((idx) => !occupied.has(idx))
    if (desk != null) {
      assignments.set(pony.id, desk)
      occupied.add(desk)
    }
  }

  return assignments
}

export function deskIndexForPony(pony: Pony, roster: Pony[]): number {
  const presetIdx = PRESET_PONY_ORDER.indexOf(pony.id as (typeof PRESET_PONY_ORDER)[number])
  if (presetIdx >= 0) return presetIdx
  return buildDeskAssignments(roster).get(pony.id) ?? CUSTOM_DESK_INDICES[0]
}

/** 在已占用工位集合中找第一个可用的自定义马工位（用于新招聘，不挪动已在座的小马） */
export function firstEmptyCustomDesk(occupied: Iterable<number>): number {
  const taken = occupied instanceof Set ? occupied : new Set(occupied)
  return CUSTOM_DESK_INDICES.find((idx) => !taken.has(idx)) ?? CUSTOM_DESK_INDICES[0]
}

/** 收集当前场景中已占用的工位（预置马固定位 + 已入驻自定义马的实际工位） */
export function collectOccupiedDesks(
  roster: Pony[],
  mountedDeskById: ReadonlyMap<string, number>
): Set<number> {
  const occupied = new Set<number>()
  for (const id of PRESET_PONY_ORDER) {
    if (roster.some((p) => p.id === id)) {
      occupied.add(PRESET_PONY_ORDER.indexOf(id))
    }
  }
  for (const desk of mountedDeskById.values()) {
    occupied.add(desk)
  }
  return occupied
}
