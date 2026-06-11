import { useSyncExternalStore } from 'react'

export type Appearance = 'pony' | 'light' | 'dark'

const STORAGE_KEY = 'pony-office-appearance'
const listeners = new Set<() => void>()

function readStoredAppearance(): Appearance {
  const value = window.localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : 'pony'
}

let appearance: Appearance = readStoredAppearance()

function applyAppearance(value: Appearance): void {
  document.documentElement.dataset.appearance = value
  document.documentElement.style.colorScheme = value === 'dark' ? 'dark' : 'light'
}

applyAppearance(appearance)

export function setAppearance(value: Appearance): void {
  if (appearance === value) return
  appearance = value
  window.localStorage.setItem(STORAGE_KEY, value)
  applyAppearance(value)
  listeners.forEach((listener) => listener())
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => appearance
  )
}
