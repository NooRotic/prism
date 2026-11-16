import { STORAGE_KEYS } from '../config/storageKeys'

/**
 * The streams this viewer starred, kept in this browser only (the server is told about stars as plain +1 / -1 counts, never
 * who sent them). A blocked or full storage never throws: the stars then last until the page is closed.
 */

const MAX_FAVORITES = 1000
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

type Listener = () => void

let current: ReadonlySet<string> | null = null
const listeners = new Set<Listener>()

function readStored(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_FAVORITE_STREAMS)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const ids = parsed.filter((value): value is string => typeof value === 'string' && ID_PATTERN.test(value))
    return new Set(ids.slice(0, MAX_FAVORITES))
  } catch {
    return new Set()
  }
}

function writeStored(ids: ReadonlySet<string>): void {
  try {
    if (ids.size === 0) localStorage.removeItem(STORAGE_KEYS.LOCAL_FAVORITE_STREAMS)
    else localStorage.setItem(STORAGE_KEYS.LOCAL_FAVORITE_STREAMS, JSON.stringify([...ids]))
  } catch {
    /* storage blocked or full: the stars just are not remembered */
  }
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/** The starred ids. The same Set object until a star changes, so it is safe to use as a store snapshot. */
export function getFavorites(): ReadonlySet<string> {
  current ??= readStored()
  return current
}

export function isFavorite(id: string): boolean {
  return getFavorites().has(id)
}

/**
 * Stars or un-stars a stream and returns whether it changed (a repeat of the state it already has changes nothing, so the
 * caller never reports a count for it). An id that is not a short id, or a star beyond the limit, is refused.
 */
export function setFavorite(id: string, on: boolean): boolean {
  if (!ID_PATTERN.test(id)) return false
  const now = getFavorites()
  if (now.has(id) === on) return false
  if (on && now.size >= MAX_FAVORITES) return false
  const next = new Set(now)
  if (on) next.add(id)
  else next.delete(id)
  current = next
  writeStored(next)
  notify()
  return true
}

export function subscribeFavorites(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEYS.LOCAL_FAVORITE_STREAMS) return
    current = readStored() // another tab changed the stars
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Forgets what was read from storage. For tests. */
export function resetFavoritesCache(): void {
  current = null
  notify()
}
