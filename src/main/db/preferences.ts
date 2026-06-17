import type { DatabaseSync } from 'node:sqlite'
import type { UserPreferences } from '../../shared/types'

let dbRef: DatabaseSync

const META_KEY = 'user_preferences'

export function bindPreferencesDb(db: DatabaseSync): void {
  dbRef = db
}

const DEFAULT: UserPreferences = {
  desktopNotifications: true,
  inAppNotifications: true
}

export function getUserPreferences(): UserPreferences {
  const row = dbRef.prepare('SELECT value FROM app_meta WHERE key = ?').get(META_KEY) as
    | { value: string }
    | undefined
  if (!row) return { ...DEFAULT }
  try {
    const parsed = JSON.parse(row.value) as Partial<UserPreferences>
    return {
      desktopNotifications: parsed.desktopNotifications ?? DEFAULT.desktopNotifications,
      inAppNotifications: parsed.inAppNotifications ?? DEFAULT.inAppNotifications
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveUserPreferences(prefs: UserPreferences): UserPreferences {
  const normalized: UserPreferences = {
    desktopNotifications: Boolean(prefs.desktopNotifications),
    inAppNotifications: Boolean(prefs.inAppNotifications)
  }
  dbRef
    .prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)')
    .run(META_KEY, JSON.stringify(normalized))
  return normalized
}
