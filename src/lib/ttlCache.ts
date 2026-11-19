/** A tiny localStorage cache with a time-to-live. Never throws: a full or blocked store just means no cache. */

export function ttlGet<T>(key: string, ttlMs: number, now = Date.now()): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    const entry = JSON.parse(raw) as { at?: number; value?: T }
    if (typeof entry.at !== 'number' || now - entry.at >= ttlMs) return null
    return entry.value ?? null
  } catch {
    return null
  }
}

export function ttlSet<T>(key: string, value: T, now = Date.now()): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: now, value }))
  } catch {
    /* quota or blocked storage: skip the cache write */
  }
}
