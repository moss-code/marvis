/** 办公室编制与工位布局 —— 主进程与渲染进程共享 */
import type { Pony } from './types'

export const OFFICE_CAPACITY = 12
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
  ponyScale: number
  deskScale: number
}

const FRONT_X = [220, 450, 680, 910, 1140, 1370]
const BACK_X = [335, 565, 795, 1025, 1255, 1485]

export const DESK_SLOTS: readonly DeskSlot[] = [
  ...FRONT_X.map(
    (x, i): DeskSlot => ({
      index: i,
      x,
      y: 0,
      row: 'front',
      ponyScale: 1,
      deskScale: 1
    })
  ),
  ...BACK_X.map(
    (x, i): DeskSlot => ({
      index: i + 6,
      x,
      y: -88,
      row: 'back',
      ponyScale: 0.88,
      deskScale: 0.92
    })
  )
]

export function getDeskSlot(index: number): DeskSlot {
  return DESK_SLOTS[index] ?? DESK_SLOTS[DESK_SLOTS.length - 1]
}

export function isPresetPony(id: string): boolean {
  return (PRESET_PONY_ORDER as readonly string[]).includes(id)
}

/** 预置马固定前排 0–4；自定义马按 roster 顺序映射到工位 5–11 */
export function deskIndexForPony(pony: Pony, roster: Pony[]): number {
  const presetIdx = PRESET_PONY_ORDER.indexOf(pony.id as (typeof PRESET_PONY_ORDER)[number])
  if (presetIdx >= 0) return presetIdx
  const customs = roster.filter((p) => !isPresetPony(p.id))
  const customIdx = customs.findIndex((p) => p.id === pony.id)
  return customIdx >= 0 ? CUSTOM_DESK_INDICES[customIdx] : CUSTOM_DESK_INDICES[0]
}

