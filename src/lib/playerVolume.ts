import { STORAGE_KEYS } from '../config/storageKeys'

/**
 * The viewer's chosen player volume, kept across loads. Only the volume is saved, never the muted state: a browser that
 * refuses autoplay with sound forces a muted start, and saving that would turn one policy decision into a lasting setting.
 * Every call is safe to make anywhere: storage can be blocked, and a player can be gone, so nothing here throws.
 */

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** The saved volume as 0..1, or null when nothing usable is saved (or storage is blocked). */
export function readSavedVolume(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_PLAYER_VOLUME)
    if (raw === null || raw.trim() === '') return null
    const value = Number(raw)
    return Number.isFinite(value) ? clamp01(value) : null
  } catch {
    return null
  }
}

/** Saves the volume (clamped to 0..1). A non-finite value is ignored. */
export function saveVolume(volume: number): void {
  if (!Number.isFinite(volume)) return
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_PLAYER_VOLUME, String(clamp01(volume)))
  } catch {
    /* storage blocked or full: the volume just is not remembered */
  }
}

/** Hands the saved volume to `set` (an engine's own setter). Returns true when a volume was applied. */
export function applySavedVolume(set: (volume: number) => void): boolean {
  const saved = readSavedVolume()
  if (saved === null) return false
  try {
    set(saved)
    return true
  } catch {
    return false
  }
}
