import { STORAGE_KEYS } from '../config/storageKeys'
import type { CatchupVideo } from './catchup'
import { logger } from './logger'

export interface StoredChannel {
  id: string
  title: string
}

const WATCHED_MAX = 10
const LANE_TTL_MS = 30 * 60 * 1000

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    logger.warn('[catchupStore] could not write', key, err)
  }
}

function readList<T>(key: string): T[] {
  const v = readJson<unknown>(key, [])
  return Array.isArray(v) ? (v as T[]) : []
}

export function getSubscriptions(): StoredChannel[] {
  return readList<StoredChannel>(STORAGE_KEYS.LOCAL_CATCHUP_SUBSCRIPTIONS)
}

/** Replacing the subscriptions also drops the cached subscription lane, which was built from the old list. */
export function setSubscriptions(list: StoredChannel[]): void {
  writeJson(STORAGE_KEYS.LOCAL_CATCHUP_SUBSCRIPTIONS, list)
  try {
    localStorage.removeItem(STORAGE_KEYS.LOCAL_CATCHUP_LANE_CACHE)
  } catch {
    /* storage unavailable: nothing cached to drop */
  }
}

export function getWatchLater(): string[] {
  return readList<string>(STORAGE_KEYS.LOCAL_CATCHUP_WATCH_LATER)
}

export function setWatchLater(ids: string[]): void {
  writeJson(STORAGE_KEYS.LOCAL_CATCHUP_WATCH_LATER, ids)
}

/** Remember a video the owner played in PRISM: newest first, no repeats, at most 10. */
export function recordWatched(videoId: string): void {
  // The player route takes any text, so a typo or a deleted address must not become a related-lane seed.
  if (!/^[\w-]{11}$/.test(videoId)) return
  const next = [videoId, ...readList<string>(STORAGE_KEYS.LOCAL_CATCHUP_WATCHED).filter((id) => id !== videoId)]
  writeJson(STORAGE_KEYS.LOCAL_CATCHUP_WATCHED, next.slice(0, WATCHED_MAX))
}

export function getWatchedSeeds(n = 3): string[] {
  return readList<string>(STORAGE_KEYS.LOCAL_CATCHUP_WATCHED).slice(0, n)
}

export function readSLaneCache(now = Date.now()): CatchupVideo[] | null {
  const c = readJson<{ at?: number; videos?: CatchupVideo[] } | null>(STORAGE_KEYS.LOCAL_CATCHUP_LANE_CACHE, null)
  if (!c || typeof c.at !== 'number' || !Array.isArray(c.videos)) return null
  return now - c.at < LANE_TTL_MS ? c.videos : null
}

export function writeSLaneCache(videos: CatchupVideo[], now = Date.now()): void {
  writeJson(STORAGE_KEYS.LOCAL_CATCHUP_LANE_CACHE, { at: now, videos })
}
