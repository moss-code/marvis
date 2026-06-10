import type { PaletteId } from '@shared/types'

export interface PonyPalette {
  body: number
  mane: number
  accent: number
  muzzle: number
}

/** 暖色调中性色：有机极简主义设计体系内的 5 套预设 */
export const PALETTES: Record<PaletteId, PonyPalette> = {
  linen: { body: 0xe8dfd0, mane: 0xc9bca6, accent: 0xb08d57, muzzle: 0xf2ebdd },
  camel: { body: 0xc9a77c, mane: 0x8a6f4d, accent: 0x6b5639, muzzle: 0xdfc4a0 },
  ochre: { body: 0xd9b98c, mane: 0xb5835a, accent: 0x8c6239, muzzle: 0xe8d2ae },
  sage: { body: 0xa8b59a, mane: 0x7a8a6e, accent: 0x55624c, muzzle: 0xc2cdb4 },
  terracotta: { body: 0xc97d5e, mane: 0x96523b, accent: 0x6e3c2b, muzzle: 0xdca088 }
}

/** 场景环境色 */
export const ENV = {
  wallTop: 0xf2ece0,
  wallBottom: 0xe9e0cf,
  floor: 0xc4a37b,
  floorEdge: 0xa9885f,
  deskWood: 0x9a7b55,
  deskWoodDark: 0x7e6244,
  brass: 0xb08d57,
  whiteboard: 0xfbf7ef,
  windowLight: 0xfdf6e3,
  plant: 0x7a8a6e,
  plantDark: 0x5d6b52,
  pot: 0xb5835a,
  textDark: 0x4a4036,
  bubbleBg: 0xfbf7ef,
  bubbleBorder: 0xd9cbb5
}
