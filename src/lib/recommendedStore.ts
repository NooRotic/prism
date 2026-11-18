import { STORAGE_KEYS } from '../config/storageKeys'
import { logger } from './logger'

export interface StoredRecommended {
  /** Twitch channel logins, as Twitch recommended them to the owner at the time of the import. */
  logins: string[]
  /** When the helper extension sent them (ms since epoch). */
  importedAt: number
}

/** The recommended Twitch channels the owner imported through the PRISM helper; null if none or the record is damaged. */
export function getRecommended(): StoredRecommended | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_RECOMMENDED)
    if (raw === null) return null
    const r = JSON.parse(raw) as Partial<StoredRecommended> | null
    if (!r || !Array.isArray(r.logins) || !r.logins.every((l) => typeof l === 'string') || typeof r.importedAt !== 'number') return null
    return { logins: r.logins, importedAt: r.importedAt }
  } catch {
    return null
  }
}

export function setRecommended(logins: string[], now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_RECOMMENDED, JSON.stringify({ logins, importedAt: now }))
  } catch (err) {
    logger.warn('[recommendedStore] could not write', err)
  }
}

export function clearRecommended(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_TWITCH_RECOMMENDED)
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
