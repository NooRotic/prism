import { HISTORY_API_URL, HISTORY_ENABLED } from '../config/historyServer'

/**
 * The history server's star counts. Counts are anonymous totals per stream: the server is told "+1" or "-1" for a stream and
 * nothing about who sent it. Every call here is best effort and never throws; a page works the same with no server.
 */

const REQUEST_TIMEOUT_MS = 10_000
const SERVER_ID = /^[0-9a-f]{12}$/

export type FavoriteCounts = Readonly<Record<string, number>>

const EMPTY: FavoriteCounts = {}

type Listener = () => void
let counts: FavoriteCounts = EMPTY
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<Listener>()

const notify = () => listeners.forEach((listener) => listener())

/** Maps the server's `{ v: 1, counts: { id: n } }` to counts; null when it is not that shape. Entries that are not a positive whole number are dropped. */
export function parseFavoriteCounts(json: unknown): FavoriteCounts | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const root = json as Record<string, unknown>
  if (root.v !== 1) return null
  const raw = root.counts
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const result: Record<string, number> = {}
  for (const [id, n] of Object.entries(raw)) {
    if (SERVER_ID.test(id) && typeof n === 'number' && Number.isInteger(n) && n > 0) result[id] = n
  }
  return result
}

/** The counts this page session has, or an empty set until they arrive. */
export function getFavoriteCounts(): FavoriteCounts {
  return counts
}

export function subscribeFavoriteCounts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Fetches the counts once per page session (one request is shared); a failure is not remembered, so the next ask tries again. */
export function loadFavoriteCounts(): Promise<void> {
  if (!HISTORY_ENABLED || loaded) return Promise.resolve()
  if (!inflight) {
    inflight = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(`${HISTORY_API_URL}/api/favorites`, { method: 'GET', credentials: 'omit', signal: controller.signal })
        if (!response.ok) return
        const parsed = parseFavoriteCounts(await response.json())
        if (parsed === null) return
        counts = parsed
        loaded = true
        notify()
      } catch {
        /* no count this time: the page shows none */
      } finally {
        clearTimeout(timer)
        inflight = null
      }
    })()
  }
  return inflight
}

/** Shows a star at once, before the server's next list: adds `delta` to the stream's number (never below zero). */
export function adjustFavoriteCount(id: string, delta: number): void {
  const next = Math.max(0, (counts[id] ?? 0) + delta)
  counts = { ...counts }
  if (next === 0) delete (counts as Record<string, number>)[id]
  else (counts as Record<string, number>)[id] = next
  notify()
}

/**
 * Tells the server a stream was starred or un-starred. The body is JSON sent as plain text with no custom headers, so the
 * browser sends no preflight, and the page never waits for the answer. Only a listed stream's short id is sent (a demo or a
 * pasted address has none).
 */
export function sendFavorite(id: string, on: boolean): void {
  if (!HISTORY_ENABLED || !SERVER_ID.test(id)) return
  try {
    void fetch(`${HISTORY_API_URL}/api/favorite`, {
      method: 'POST',
      body: JSON.stringify({ id, on }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* no fetch, or it threw before returning a promise: counting is best effort */
  }
}

/** Forgets the counts and any request in flight. For tests. */
export function resetFavoriteCounts(): void {
  counts = EMPTY
  loaded = false
  inflight = null
  notify()
}
