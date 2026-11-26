import { HISTORY_API_URL, HISTORY_ENABLED } from '../config/historyServer'
import { isQrStyle, type QrStyle } from './cast/qrCode'

/** What the owner set for the TV in /admin. */
export interface TvSettings {
  qrStyle: QrStyle
}

const REQUEST_TIMEOUT_MS = 5_000

export function parseTvSettings(json: unknown): TvSettings | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const { v, qrStyle } = json as { v?: unknown; qrStyle?: unknown }
  return v === 1 && isQrStyle(qrStyle) ? { qrStyle } : null
}

/**
 * `GET /api/tv` on the history server. The server lets a copy be kept five minutes; this asks past it (`no-cache`), so a
 * change in /admin shows the next time the TV asks. Never throws: null means "not known", and the caller keeps what it had.
 */
export async function fetchTvSettings(): Promise<TvSettings | null> {
  if (!HISTORY_ENABLED) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${HISTORY_API_URL}/api/tv`, {
      cache: 'no-cache',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return parseTvSettings(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
